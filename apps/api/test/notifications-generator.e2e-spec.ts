import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { NotificationGenerator } from '../src/notifications/notification-generator.service.js';
import {
  NotificationsScheduler,
  SCAN_LOCK_KEY,
} from '../src/notifications/notifications.scheduler.js';
import {
  FakeClock,
  bearer,
  createTestApp,
  listActivities,
  registerUser,
  scanWhenFree,
  type TestUser,
} from './helpers.js';

// Quarta 2026-10-07. São Paulo é UTC-3: 09:00 local = 12:00Z.
const NOON_Z = '2026-10-07T15:00:00.000Z';

describe('Geração de notificações (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let generator: NotificationGenerator;
  let scheduler: NotificationsScheduler;
  const clock = new FakeClock(NOON_Z);
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp({ clock });
    prisma = app.get(PrismaService);
    generator = app.get(NotificationGenerator);
    scheduler = app.get(NotificationsScheduler);
  });
  afterAll(async () => {
    await app.close();
  });

  const setup = async (timezone?: string) => {
    const user = await registerUser(app);
    if (timezone) {
      await request(server()).patch('/api/users/me').set(bearer(user)).send({ timezone });
    }
    const [activity] = await listActivities(app, user);
    return { user, activity: activity! };
  };
  const send = (method: 'post' | 'put' | 'patch', user: TestUser, path: string, body: object) =>
    request(server())[method](path).set(bearer(user)).send(body);

  /** Bloco semanal às quartas, às `startTime` (válido desde 02/09). */
  const weeklyBlock = async (user: TestUser, activityId: string, startTime = '09:00') => {
    const res = await send('post', user, '/api/blocks', {
      recurrence: 'weekly',
      activityId,
      weekday: 3,
      startTime,
      durationMin: 60,
      validFrom: '2026-09-02',
    });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  };
  const createEvent = async (user: TestUser, body: object) => {
    const res = await send('post', user, '/api/events', {
      title: 'Consulta',
      category: 'medical',
      date: '2026-10-07',
      ...body,
    });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  };
  const scan = (user: TestUser, iso: string) => generator.scanUser(user.userId, new Date(iso));
  const stored = (user: TestUser) =>
    prisma.notification.findMany({
      where: { userId: user.userId },
      orderBy: { scheduledFor: 'asc' },
    });
  const setPrefs = (user: TestUser, data: object) =>
    prisma.notificationPreference.upsert({
      where: { userId: user.userId },
      create: { userId: user.userId, ...data },
      update: data,
    });

  describe('lembrete de bloco', () => {
    it('gera o aviso 15 min antes, com título, corpo e origem', async () => {
      const { user, activity } = await setup();
      const block = await weeklyBlock(user, activity.id);

      expect(await scan(user, '2026-10-07T11:45:20.000Z')).toBe(1);

      const [notification] = await stored(user);
      expect(notification).toMatchObject({
        kind: 'BLOCK',
        title: `${activity.name} começa em 15 minutos`,
        body: 'Das 09:00 às 10:00.',
        dedupeKey: `block:${block.id}:2026-10-07:15`,
        blockId: block.id,
        eventId: null,
        readAt: null,
      });
      expect(notification!.scheduledFor.toISOString()).toBe('2026-10-07T11:45:00.000Z');
      expect(notification!.occurrenceDate!.toISOString().slice(0, 10)).toBe('2026-10-07');
    });

    it('é idempotente: varrer de novo (várias vezes, a cada minuto) não duplica', async () => {
      const { user, activity } = await setup();
      await weeklyBlock(user, activity.id);

      expect(await scan(user, '2026-10-07T11:45:20.000Z')).toBe(1);
      for (const minute of ['46', '47', '48', '49']) {
        expect(await scan(user, `2026-10-07T11:${minute}:20.000Z`)).toBe(0);
      }
      expect(await prisma.notification.count({ where: { userId: user.userId } })).toBe(1);
    });

    it('varreduras simultâneas (duas instâncias) também não duplicam', async () => {
      const { user, activity } = await setup();
      await weeklyBlock(user, activity.id);

      const created = await Promise.all(
        Array.from({ length: 6 }, () => scan(user, '2026-10-07T11:45:20.000Z')),
      );

      expect(created.reduce((sum, n) => sum + n, 0)).toBe(1);
      expect(await prisma.notification.count({ where: { userId: user.userId } })).toBe(1);
    });

    it('não gera antes da hora, nem depois que o bloco começou', async () => {
      const { user, activity } = await setup();
      await weeklyBlock(user, activity.id);

      expect(await scan(user, '2026-10-07T11:44:59.000Z')).toBe(0);
      expect(await scan(user, '2026-10-07T12:00:30.000Z')).toBe(0);
      expect(await scan(user, '2026-10-07T13:00:00.000Z')).toBe(0);
      expect(await prisma.notification.count({ where: { userId: user.userId } })).toBe(0);
    });

    it('recupera o lembrete de uma queda curta (varredura 5 min atrasada)', async () => {
      const { user, activity } = await setup();
      await weeklyBlock(user, activity.id);

      expect(await scan(user, '2026-10-07T11:50:00.000Z')).toBe(1);
    });

    it('bloco pulado não avisa', async () => {
      const { user, activity } = await setup();
      const block = await weeklyBlock(user, activity.id);
      await send('put', user, `/api/blocks/${block.id}/exceptions/2026-10-07`, { type: 'skip' });

      expect(await scan(user, '2026-10-07T11:45:20.000Z')).toBe(0);
    });

    it('ocorrência que já tem conclusão ativa não avisa', async () => {
      const { user, activity } = await setup();
      const block = await weeklyBlock(user, activity.id);
      // estado forçado no banco: a conclusão existe antes do lembrete
      await prisma.completion.create({
        data: {
          userId: user.userId,
          blockId: block.id,
          occurrenceDate: new Date('2026-10-07T00:00:00.000Z'),
          completedAt: new Date('2026-10-07T08:00:00.000Z'),
          activityId: activity.id,
          areaId: activity.areaId,
          durationMin: 60,
          xpAmount: 60,
        },
      });

      expect(await scan(user, '2026-10-07T11:45:20.000Z')).toBe(0);
    });

    it('bloco movido de dia avisa no dia novo, mas a chave guarda a data original', async () => {
      const { user, activity } = await setup();
      const block = await weeklyBlock(user, activity.id);
      await send('put', user, `/api/blocks/${block.id}/exceptions/2026-10-07`, {
        type: 'override',
        newDate: '2026-10-08',
      });

      expect(await scan(user, '2026-10-07T11:45:20.000Z')).toBe(0);
      expect(await scan(user, '2026-10-08T11:45:20.000Z')).toBe(1);
      expect((await stored(user))[0]!.dedupeKey).toBe(`block:${block.id}:2026-10-07:15`);
    });

    it('bloco que começa logo depois da meia-noite local avisa na noite anterior', async () => {
      const { user, activity } = await setup();
      await send('post', user, '/api/blocks', {
        recurrence: 'once',
        activityId: activity.id,
        date: '2026-10-08',
        startTime: '00:10',
        durationMin: 30,
      });

      // 00:10 de quinta em São Paulo = 03:10Z; lembrete às 03:55Z? não: 15 min antes = 03:55 do dia anterior
      expect(await scan(user, '2026-10-08T02:55:20.000Z')).toBe(1);
    });

    it('usa a antecedência escolhida e respeita "desligado"', async () => {
      const { user, activity } = await setup();
      await weeklyBlock(user, activity.id);
      await setPrefs(user, { blockLeadMin: 30 });

      expect(await scan(user, '2026-10-07T11:30:20.000Z')).toBe(1);
      expect((await stored(user))[0]!.dedupeKey).toMatch(/:30$/);

      const { user: other, activity: otherActivity } = await setup();
      await weeklyBlock(other, otherActivity.id);
      await setPrefs(other, { blockRemindersEnabled: false });
      expect(await scan(other, '2026-10-07T11:45:20.000Z')).toBe(0);
    });

    it('o horário é do fuso da pessoa (Tóquio: 09:00 local = 00:00Z)', async () => {
      const { user, activity } = await setup('Asia/Tokyo');
      await weeklyBlock(user, activity.id);

      // em Tóquio o bloco de quarta 09:00 começa às 00:00Z; o lembrete sai às 23:45Z de terça
      expect(await scan(user, '2026-10-07T11:45:20.000Z')).toBe(0); // a hora de São Paulo não vale
      expect(await scan(user, '2026-10-06T23:45:20.000Z')).toBe(1);
      expect((await stored(user))[0]!.scheduledFor.toISOString()).toBe('2026-10-06T23:45:00.000Z');
    });
  });

  describe('isolamento entre pessoas', () => {
    it('nunca gera aviso para a pessoa errada', async () => {
      const [ana, bia] = [await setup(), await setup()];
      await weeklyBlock(ana.user, ana.activity.id);

      expect(await scan(bia.user, '2026-10-07T11:45:20.000Z')).toBe(0);
      expect(await scan(ana.user, '2026-10-07T11:45:20.000Z')).toBe(1);
      expect(await prisma.notification.count({ where: { userId: bia.user.userId } })).toBe(0);
    });

    it('a mesma chave em duas pessoas gera um aviso para cada uma', async () => {
      const [ana, bia] = [await setup(), await setup()];
      await createEvent(ana.user, { time: '14:30', remindBeforeMin: 60 });
      await createEvent(bia.user, { time: '14:30', remindBeforeMin: 60 });

      expect(await scan(ana.user, '2026-10-07T16:30:10.000Z')).toBe(1);
      expect(await scan(bia.user, '2026-10-07T16:30:10.000Z')).toBe(1);
    });
  });

  describe('lembrete de evento', () => {
    it('com hora: 1 hora antes, com a antecedência do próprio evento', async () => {
      const { user } = await setup();
      const event = await createEvent(user, { time: '14:30', remindBeforeMin: 60 });

      expect(await scan(user, '2026-10-07T16:30:10.000Z')).toBe(1);

      const [notification] = await stored(user);
      expect(notification).toMatchObject({
        kind: 'EVENT',
        title: 'Consulta começa em 1 hora',
        body: '7 de outubro, às 14:30.',
        eventId: event.id,
        blockId: null,
      });
    });

    it('padrão de 1 dia antes (RN24) para evento criado sem informar o lembrete', async () => {
      const { user } = await setup();
      await createEvent(user, { date: '2026-10-08', time: '14:30' });

      expect(await scan(user, '2026-10-07T17:30:10.000Z')).toBe(1);
      expect((await stored(user))[0]!.title).toBe('Consulta amanhã, às 14:30');
    });

    it('dia todo: sai na hora do resumo, no dia anterior', async () => {
      const { user } = await setup();
      await createEvent(user, {
        title: 'Aniversário da mãe',
        date: '2026-10-20',
        category: 'birthday',
      });

      expect(await scan(user, '2026-10-19T09:59:00.000Z')).toBe(0);
      expect(await scan(user, '2026-10-19T10:00:30.000Z')).toBe(1);
      expect((await stored(user))[0]!.title).toBe('Aniversário da mãe amanhã');
    });

    it('2 dias antes, em evento de dia todo, sai dois dias antes na hora do resumo', async () => {
      const { user } = await setup();
      await createEvent(user, { title: 'Viagem', date: '2026-10-21', remindBeforeMin: 2880 });

      expect(await scan(user, '2026-10-18T10:00:30.000Z')).toBe(0); // 3 dias antes: cedo demais
      expect(await scan(user, '2026-10-19T10:00:30.000Z')).toBe(1);
      expect((await stored(user))[0]!.title).toBe('Viagem em 2 dias');
    });

    it('sem lembrete, não avisa', async () => {
      const { user } = await setup();
      await createEvent(user, { time: '14:30', remindBeforeMin: null });

      expect(await scan(user, '2026-10-07T17:30:10.000Z')).toBe(0);
      expect(await scan(user, '2026-10-07T16:30:10.000Z')).toBe(0);
    });

    it('desligado nas preferências, não avisa', async () => {
      const { user } = await setup();
      await createEvent(user, { time: '14:30', remindBeforeMin: 60 });
      await setPrefs(user, { eventRemindersEnabled: false });

      expect(await scan(user, '2026-10-07T16:30:10.000Z')).toBe(0);
    });

    it('depois de editar a hora do evento, o aviso novo sai (chave nova) e o antigo não repete', async () => {
      const { user } = await setup();
      const event = await createEvent(user, { time: '14:30', remindBeforeMin: 60 });
      expect(await scan(user, '2026-10-07T16:30:10.000Z')).toBe(1);

      await send('patch', user, `/api/events/${event.id}`, { time: '16:30' });
      expect(await scan(user, '2026-10-07T16:31:10.000Z')).toBe(0);
      expect(await scan(user, '2026-10-07T18:30:10.000Z')).toBe(1);
      expect(await prisma.notification.count({ where: { userId: user.userId } })).toBe(2);
    });
  });

  describe('resumo do dia', () => {
    it('sai às 07:00 locais com blocos e eventos do dia', async () => {
      const { user, activity } = await setup();
      await weeklyBlock(user, activity.id, '08:00');
      await createEvent(user, { time: '19:00', remindBeforeMin: null });

      expect(await scan(user, '2026-10-07T10:00:20.000Z')).toBe(1);

      const [digest] = await stored(user);
      expect(digest).toMatchObject({
        kind: 'DIGEST',
        title: 'Seu dia',
        dedupeKey: 'digest:2026-10-07',
        blockId: null,
        eventId: null,
      });
      expect(digest!.body).toBe(
        `Hoje: 1 bloco e 1 evento. O primeiro bloco é ${activity.name}, às 08:00.`,
      );
    });

    it('não repete no mesmo dia e sai de novo no dia seguinte', async () => {
      const { user, activity } = await setup();
      await weeklyBlock(user, activity.id, '08:00');
      // outro bloco às quintas
      await send('post', user, '/api/blocks', {
        recurrence: 'weekly',
        activityId: activity.id,
        weekday: 4,
        startTime: '08:00',
        durationMin: 60,
        validFrom: '2026-09-03',
      });

      expect(await scan(user, '2026-10-07T10:00:20.000Z')).toBe(1);
      expect(await scan(user, '2026-10-07T10:30:00.000Z')).toBe(0);
      expect(await scan(user, '2026-10-08T10:00:20.000Z')).toBe(1);
    });

    it('dia sem nada não gera resumo vazio', async () => {
      const { user, activity } = await setup();
      await weeklyBlock(user, activity.id); // só às quartas

      expect(await scan(user, '2026-10-08T10:00:20.000Z')).toBe(0);
    });

    it('desligado, ou em outra hora, respeita a preferência', async () => {
      const { user, activity } = await setup();
      await weeklyBlock(user, activity.id, '08:00');
      await setPrefs(user, { digestEnabled: false });
      expect(await scan(user, '2026-10-07T10:00:20.000Z')).toBe(0);

      await setPrefs(user, { digestEnabled: true, digestTime: '06:30' });
      expect(await scan(user, '2026-10-07T09:30:20.000Z')).toBe(1);
    });
  });

  describe('varredura geral', () => {
    it('só varre quem tem blocos ou eventos e soma o que foi criado', async () => {
      const [ana, bia, caio] = [await setup(), await setup(), await setup()];
      await weeklyBlock(ana.user, ana.activity.id);
      await createEvent(bia.user, { time: '09:15', remindBeforeMin: 15 });
      void caio; // sem nada: não entra na varredura

      const summary = await generator.scanAll(new Date('2026-10-07T11:45:20.000Z'));

      // O banco é compartilhado com as outras suítes em paralelo: o total de pessoas varridas muda a
      // qualquer momento, então só dá para afirmar o mínimo (Ana e Bia) e conferir conta a conta.
      expect(summary.users).toBeGreaterThanOrEqual(2);
      expect(summary.failures).toBe(0);
      expect(summary.created).toBeGreaterThanOrEqual(1);
      expect(await prisma.notification.count({ where: { userId: ana.user.userId } })).toBe(1);
      expect(await prisma.notification.count({ where: { userId: caio.user.userId } })).toBe(0);
    });

    it('a falha de uma pessoa não impede as outras', async () => {
      const [ana, bia] = [await setup(), await setup()];
      await weeklyBlock(ana.user, ana.activity.id);
      await weeklyBlock(bia.user, bia.activity.id);

      let injected = 0;
      const original = generator.scanUser.bind(generator);
      const spy = vi.spyOn(generator, 'scanUser').mockImplementation(async (userId, now) => {
        if (userId === ana.user.userId) {
          injected += 1;
          throw new Error('falha simulada');
        }
        return original(userId, now);
      });
      try {
        const summary = await generator.scanAll(new Date('2026-10-07T11:45:20.000Z'));
        // O banco é compartilhado com outras suítes em paralelo (uma delas exclui contas no meio da
        // varredura), então o total de falhas não é só a nossa: confere a injetada e o mínimo.
        expect(injected).toBe(1);
        expect(summary.failures).toBeGreaterThanOrEqual(1);
      } finally {
        spy.mockRestore();
      }

      expect(await prisma.notification.count({ where: { userId: ana.user.userId } })).toBe(0);
      expect(await prisma.notification.count({ where: { userId: bia.user.userId } })).toBe(1);
    });
  });

  describe('agendador', () => {
    it('com o agendador desligado (testes), o minuto não gera nada', async () => {
      const { user, activity } = await setup();
      await weeklyBlock(user, activity.id);
      clock.set('2026-10-07T11:45:20.000Z');

      await scheduler.tick();

      expect(await prisma.notification.count({ where: { userId: user.userId } })).toBe(0);
    });

    it('runOnce varre e devolve o resumo', async () => {
      const { user, activity } = await setup();
      await weeklyBlock(user, activity.id);

      const summary = await scanWhenFree(() =>
        scheduler.runOnce(new Date('2026-10-07T11:45:20.000Z')),
      );

      expect(summary.created).toBeGreaterThanOrEqual(1);
      expect(await prisma.notification.count({ where: { userId: user.userId } })).toBe(1);
    }, 120_000);

    it('se outra instância já está varrendo (trava de banco), pula o minuto sem gerar nada', async () => {
      const { user, activity } = await setup();
      await weeklyBlock(user, activity.id);

      // Pegar a trava pode esperar a varredura de outra suíte terminar: o prazo padrão da transação
      // (5 s) não basta com o banco compartilhado.
      const result = await prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SCAN_LOCK_KEY})`;
          // a "outra instância" segura a trava; esta varredura usa outra conexão e não consegue
          return scheduler.runOnce(new Date('2026-10-07T11:45:20.000Z'));
        },
        { timeout: 110_000, maxWait: 10_000 },
      );

      expect(result).toBeNull();
      expect(await prisma.notification.count({ where: { userId: user.userId } })).toBe(0);
    }, 120_000);
  });
});
