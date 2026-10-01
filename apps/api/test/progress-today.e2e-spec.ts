import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { progressSchema, todayResponseSchema, weekResponseSchema } from '@lifexp/shared';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  FakeClock,
  bearer,
  createTestApp,
  expectCachesConsistent,
  listActivities,
  registerUser,
  type TestUser,
} from './helpers.js';

// Quarta 2026-10-07, 12:00 em São Paulo (UTC-3).
const NOON = '2026-10-07T15:00:00.000Z';

describe('Progresso, tela Hoje e conclusões na semana (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const clock = new FakeClock(NOON);
  const server = () => app.getHttpServer();
  const usersToCheck: string[] = [];

  beforeAll(async () => {
    app = await createTestApp({ clock });
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => clock.set(NOON));

  afterEach(async () => {
    while (usersToCheck.length > 0) await expectCachesConsistent(prisma, usersToCheck.pop()!);
  });

  const setup = async (timezone?: string) => {
    const user = await registerUser(app);
    if (timezone) {
      await request(server()).patch('/api/users/me').set(bearer(user)).send({ timezone });
    }
    usersToCheck.push(user.userId);
    const activities = await listActivities(app, user);
    return { user, activity: activities[0]!, other: activities[1]! };
  };

  const createBlock = async (user: TestUser, activityId: string, overrides: object = {}) => {
    const res = await request(server())
      .post('/api/blocks')
      .set(bearer(user))
      .send({
        recurrence: 'weekly',
        activityId,
        weekday: 3, // quarta
        startTime: '09:00',
        durationMin: 60,
        validFrom: '2026-09-02',
        ...overrides,
      });
    return res.body as { id: string };
  };

  const complete = (user: TestUser, blockId: string, date = '2026-10-07') =>
    request(server())
      .post(`/api/blocks/${blockId}/occurrences/${date}/completion`)
      .set(bearer(user));
  const undo = (user: TestUser, blockId: string, date = '2026-10-07') =>
    request(server())
      .delete(`/api/blocks/${blockId}/occurrences/${date}/completion`)
      .set(bearer(user));
  const exception = (user: TestUser, blockId: string, date: string, body: object) =>
    request(server()).put(`/api/blocks/${blockId}/exceptions/${date}`).set(bearer(user)).send(body);
  const getToday = (user: TestUser) => request(server()).get('/api/today').set(bearer(user));
  const getProgress = (user: TestUser) => request(server()).get('/api/progress').set(bearer(user));
  const getWeek = (user: TestUser, weekStart: string) =>
    request(server()).get(`/api/blocks/week?weekStart=${weekStart}`).set(bearer(user));

  describe('GET /progress (RF20)', () => {
    it('exige autenticação', async () => {
      expect((await request(server()).get('/api/progress')).status).toBe(401);
    });

    it('conta nova: nível 1, 0 XP e as 7 áreas padrão zeradas, na ordem', async () => {
      const { user } = await setup();
      const res = await getProgress(user);

      expect(res.status).toBe(200);
      expect(progressSchema.safeParse(res.body).success).toBe(true);
      expect(res.body.total).toEqual({
        xp: 0,
        level: 1,
        xpIntoLevel: 0,
        xpForNextLevel: 100,
        progress: 0,
      });
      expect(res.body.areas).toHaveLength(7);
      expect(
        res.body.areas.every(
          (area: { xp: number; level: number }) => area.xp === 0 && area.level === 1,
        ),
      ).toBe(true);
      const areas = (await request(server()).get('/api/areas').set(bearer(user))).body as {
        id: string;
      }[];
      expect(res.body.areas.map((area: { areaId: string }) => area.areaId)).toEqual(
        areas.map((area) => area.id),
      );
    });

    it('segue a posição das áreas, e não a ordem em que foram criadas', async () => {
      const { user } = await setup();
      const areas = (await request(server()).get('/api/areas').set(bearer(user))).body as {
        id: string;
      }[];
      // simula um reordenamento: a primeira área passa para o fim da lista
      await prisma.area.update({ where: { id: areas[0]!.id }, data: { position: 99 } });

      const res = await getProgress(user);

      expect(res.body.areas.map((area: { areaId: string }) => area.areaId)).toEqual([
        ...areas.slice(1).map((area) => area.id),
        areas[0]!.id,
      ]);
    });

    it('depois de concluir, mostra o XP geral e o da área certa', async () => {
      const { user, activity, other } = await setup();
      const a = await createBlock(user, activity.id); // 60 XP
      const b = await createBlock(user, other.id, { startTime: '10:00', durationMin: 90 }); // 90 XP, outra área
      await complete(user, a.id);
      await complete(user, b.id);

      const res = await getProgress(user);

      expect(res.body.total).toMatchObject({ xp: 150, level: 2, xpIntoLevel: 50 });
      const byArea = new Map<string, { xp: number; level: number }>(
        res.body.areas.map((area: { areaId: string; xp: number; level: number }) => [
          area.areaId,
          area,
        ]),
      );
      expect(byArea.get(activity.areaId)).toMatchObject({ xp: 60, level: 1 });
      expect(byArea.get(other.areaId)).toMatchObject({ xp: 90, level: 1 });
    });

    it('acompanha um estorno: o XP devolvido some do total e da área', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      await complete(user, block.id);
      await undo(user, block.id);

      const res = await getProgress(user);
      expect(res.body.total.xp).toBe(0);
      expect(
        res.body.areas.find((area: { areaId: string }) => area.areaId === activity.areaId).xp,
      ).toBe(0);
    });

    it('isola os usuários: o XP de A não aparece para B (RS06)', async () => {
      const a = await setup();
      const b = await setup();
      await complete(a.user, (await createBlock(a.user, a.activity.id)).id);

      expect((await getProgress(a.user)).body.total.xp).toBe(60);
      expect((await getProgress(b.user)).body.total.xp).toBe(0);
    });
  });

  describe('GET /today (RF50 a RF52)', () => {
    it('exige autenticação', async () => {
      expect((await request(server()).get('/api/today')).status).toBe(401);
    });

    it('dia vazio: a data de hoje no fuso da pessoa, sem itens e sem XP', async () => {
      const { user } = await setup();
      const res = await getToday(user);

      expect(res.status).toBe(200);
      expect(todayResponseSchema.safeParse(res.body).success).toBe(true);
      expect(res.body).toMatchObject({
        date: '2026-10-07',
        items: [],
        xpToday: 0,
        total: { xp: 0, level: 1 },
      });
    });

    it('lista os blocos de hoje em ordem cronológica, cada um com o seu estado', async () => {
      const { user, activity } = await setup();
      const done = await createBlock(user, activity.id, { startTime: '06:00' });
      const skipped = await createBlock(user, activity.id, { startTime: '08:00' });
      const open = await createBlock(user, activity.id, { startTime: '10:00' });
      const upcoming = await createBlock(user, activity.id, { startTime: '14:00' });
      await complete(user, done.id);
      await exception(user, skipped.id, '2026-10-07', { type: 'skip' });

      const items = (await getToday(user)).body.items as {
        blockId: string;
        status: string;
        startTime: string;
      }[];

      expect(items.map((item) => [item.blockId, item.status])).toEqual([
        [done.id, 'completed'],
        [skipped.id, 'skipped'],
        [open.id, 'open'],
        [upcoming.id, 'upcoming'],
      ]);
      expect(items.map((item) => item.startTime)).toEqual(['06:00', '08:00', '10:00', '14:00']);
    });

    it('ordena por horário mesmo quando os blocos foram criados fora de ordem', async () => {
      const { user, activity } = await setup();
      // criados do mais tarde para o mais cedo: a ordem de criação NÃO é a ordem do dia
      const late = await createBlock(user, activity.id, { startTime: '18:00' });
      const early = await createBlock(user, activity.id, { startTime: '06:00' });
      const middle = await createBlock(user, activity.id, { startTime: '12:00' });

      const items = (await getToday(user)).body.items as { blockId: string }[];

      expect(items.map((item) => item.blockId)).toEqual([early.id, middle.id, late.id]);
    });

    it('lista o que ficou de ontem antes dos blocos de hoje', async () => {
      const { user, activity } = await setup();
      const today = await createBlock(user, activity.id, { weekday: 3, startTime: '06:00' });
      const yesterday = await createBlock(user, activity.id, { weekday: 2, startTime: '22:00' });

      const items = (await getToday(user)).body.items as { blockId: string; date: string }[];

      expect(items.map((item) => [item.blockId, item.date])).toEqual([
        [yesterday.id, '2026-10-06'],
        [today.id, '2026-10-07'],
      ]);
    });

    it('informa quando a janela abre e fecha, no fuso da pessoa', async () => {
      const { user, activity } = await setup();
      await createBlock(user, activity.id, { startTime: '14:00' });

      const [item] = (await getToday(user)).body.items;

      expect(item.opensAt).toBe('2026-10-07T17:00:00.000Z'); // 14:00 em SP
      expect(item.closesAt).toBe('2026-10-09T02:59:59.999Z'); // 23:59:59.999 do dia seguinte
    });

    it('mostra quanto XP cada bloco rende (duração x peso), e o XP congelado nos concluídos', async () => {
      const { user, activity } = await setup();
      await request(server())
        .patch(`/api/activities/${activity.id}`)
        .set(bearer(user))
        .send({ xpWeight: 1.5 });
      const heavy = await createBlock(user, activity.id, { startTime: '10:00', durationMin: 90 }); // 135
      const done = await createBlock(user, activity.id, { startTime: '06:00' }); // 90
      await complete(user, done.id);
      await request(server())
        .patch(`/api/activities/${activity.id}`)
        .set(bearer(user))
        .send({ xpWeight: 2 });

      const items = (await getToday(user)).body.items as { blockId: string; xpPreview: number }[];

      expect(items.find((item) => item.blockId === heavy.id)?.xpPreview).toBe(180); // peso novo: 90 x 2
      expect(items.find((item) => item.blockId === done.id)?.xpPreview).toBe(90); // congelado: 60 x 1,5
    });

    it('um concluído traz a conclusão (hora e XP)', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      await complete(user, block.id);

      const [item] = (await getToday(user)).body.items;

      expect(item.status).toBe('completed');
      expect(item.completion).toEqual({
        blockId: block.id,
        occurrenceDate: '2026-10-07',
        completedAt: NOON,
        xpAmount: 60,
      });
    });

    describe('o que ficou de ontem ainda dá tempo (janela até 23:59 de hoje)', () => {
      it('inclui os blocos de ontem, ainda abertos, e eles podem ser concluídos hoje', async () => {
        const { user, activity } = await setup();
        const yesterday = await createBlock(user, activity.id, { weekday: 2, startTime: '20:00' }); // terça

        const [item] = (await getToday(user)).body.items;
        expect(item).toMatchObject({ blockId: yesterday.id, date: '2026-10-06', status: 'open' });

        expect((await complete(user, yesterday.id, '2026-10-06')).status).toBe(200);
        expect((await getToday(user)).body.items[0].status).toBe('completed');
      });

      it('não mostra anteontem nem amanhã', async () => {
        const { user, activity } = await setup();
        await createBlock(user, activity.id, { weekday: 1 }); // segunda 05/10: anteontem
        await createBlock(user, activity.id, { weekday: 4 }); // quinta 08/10: amanhã

        expect((await getToday(user)).body.items).toHaveLength(0);
      });

      it('não mostra o que foi pulado ontem (já foi resolvido)', async () => {
        const { user, activity } = await setup();
        const block = await createBlock(user, activity.id, { weekday: 2 });
        await exception(user, block.id, '2026-10-06', { type: 'skip' });

        expect((await getToday(user)).body.items).toHaveLength(0);
      });

      it('mostra o que foi concluído ontem, para ainda poder desfazer hoje', async () => {
        const { user, activity } = await setup();
        const block = await createBlock(user, activity.id, { weekday: 2, startTime: '08:00' });
        clock.set('2026-10-06T15:00:00.000Z'); // terça 12:00
        await complete(user, block.id, '2026-10-06');
        clock.set(NOON);

        const [item] = (await getToday(user)).body.items;
        expect(item).toMatchObject({ date: '2026-10-06', status: 'completed' });
        expect((await undo(user, block.id, '2026-10-06')).status).toBe(200);
      });

      it('na virada do dia, o ontem de ontem sai da lista', async () => {
        const { user, activity } = await setup();
        await createBlock(user, activity.id, { weekday: 2 }); // terça 06/10

        expect((await getToday(user)).body.items).toHaveLength(1); // hoje é quarta
        clock.set('2026-10-08T03:30:00.000Z'); // quinta 00:30 em SP: terça ficou para trás
        expect((await getToday(user)).body.items).toHaveLength(0);
      });

      it('segunda-feira também enxerga o domingo da semana anterior', async () => {
        const { user, activity } = await setup();
        const sunday = await createBlock(user, activity.id, { weekday: 7, startTime: '19:00' });
        clock.set('2026-10-12T15:00:00.000Z'); // segunda 12/10 12:00 em SP

        const [item] = (await getToday(user)).body.items;

        expect(item).toMatchObject({ blockId: sunday.id, date: '2026-10-11', status: 'open' });
        expect((await getToday(user)).body.date).toBe('2026-10-12');
      });
    });

    it('uma ocorrência movida aparece no dia para onde foi, não no original', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id, { startTime: '14:00' });
      await exception(user, block.id, '2026-10-07', { type: 'override', newDate: '2026-10-09' }); // quarta -> sexta

      expect((await getToday(user)).body.items).toHaveLength(0);
      clock.set('2026-10-09T15:00:00.000Z'); // sexta
      const [item] = (await getToday(user)).body.items;
      expect(item).toMatchObject({
        blockId: block.id,
        occurrenceDate: '2026-10-07',
        date: '2026-10-09',
      });
    });

    it('blocos de uma atividade arquivada continuam aparecendo (e rendendo XP)', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      await request(server()).post(`/api/activities/${activity.id}/archive`).set(bearer(user));

      expect((await getToday(user)).body.items).toHaveLength(1);
      expect((await complete(user, block.id)).body.xpAwarded).toBe(60);
    });

    describe('XP do dia', () => {
      it('soma as conclusões de hoje e desconta os estornos', async () => {
        const { user, activity } = await setup();
        const a = await createBlock(user, activity.id, { startTime: '06:00' });
        const b = await createBlock(user, activity.id, { startTime: '07:00', durationMin: 30 });
        await complete(user, a.id);
        await complete(user, b.id);
        expect((await getToday(user)).body.xpToday).toBe(90);

        await undo(user, a.id);
        expect((await getToday(user)).body.xpToday).toBe(30);
      });

      it('não conta o XP ganho em outro dia', async () => {
        const { user, activity } = await setup();
        const block = await createBlock(user, activity.id, { weekday: 2, startTime: '08:00' });
        clock.set('2026-10-06T15:00:00.000Z');
        await complete(user, block.id, '2026-10-06'); // ontem

        clock.set(NOON);
        const res = await getToday(user);
        expect(res.body.xpToday).toBe(0);
        expect(res.body.total.xp).toBe(60); // mas o total acumulado inclui
      });

      it('um estorno feito hoje de uma conclusão de ontem conta hoje (pode dar negativo)', async () => {
        const { user, activity } = await setup();
        const block = await createBlock(user, activity.id, { weekday: 2, startTime: '08:00' });
        clock.set('2026-10-06T15:00:00.000Z');
        await complete(user, block.id, '2026-10-06');
        clock.set(NOON);
        await undo(user, block.id, '2026-10-06');

        expect((await getToday(user)).body.xpToday).toBe(-60);
      });

      it('a virada do dia é à meia-noite LOCAL: 23:59:59.999 conta para hoje, 00:00 já é outro dia', async () => {
        const { user, activity } = await setup();
        const block = await createBlock(user, activity.id, { startTime: '09:00' });

        clock.set('2026-10-08T02:59:59.999Z'); // 23:59:59.999 de quarta em SP
        await complete(user, block.id);
        expect(await getToday(user).then((res) => res.body)).toMatchObject({
          date: '2026-10-07',
          xpToday: 60,
        });

        clock.set('2026-10-08T03:00:00.000Z'); // 00:00 de quinta em SP
        expect(await getToday(user).then((res) => res.body)).toMatchObject({
          date: '2026-10-08',
          xpToday: 0,
        });
      });
    });

    it('um lançamento exatamente à meia-noite seguinte pertence ao dia seguinte, não ao de hoje', async () => {
      // pessoa criada à parte: o lançamento é inserido direto, então não passa pela checagem de caches
      const user = await registerUser(app);
      const area = await prisma.area.findFirstOrThrow({ where: { userId: user.userId } });
      await prisma.xpTransaction.create({
        data: {
          userId: user.userId,
          areaId: area.id,
          amount: 40,
          type: 'COMPLETION',
          createdAt: new Date('2026-10-08T03:00:00.000Z'), // 00:00:00.000 de quinta em SP
        },
      });

      clock.set('2026-10-08T02:59:59.999Z'); // último milissegundo de quarta em SP
      expect((await getToday(user)).body.xpToday).toBe(0);
      clock.set('2026-10-08T03:00:00.000Z'); // agora é quinta
      expect((await getToday(user)).body.xpToday).toBe(40);
    });

    it('o fuso da pessoa decide o que é hoje: o mesmo instante é dias diferentes em Tóquio e São Paulo', async () => {
      const tokyo = await setup('Asia/Tokyo');
      const saoPaulo = await setup('America/Sao_Paulo');
      clock.set('2026-10-07T20:00:00.000Z'); // Tóquio: 08/10 05:00; São Paulo: 07/10 17:00

      expect((await getToday(tokyo.user)).body.date).toBe('2026-10-08');
      expect((await getToday(saoPaulo.user)).body.date).toBe('2026-10-07');
    });

    it('traz o nível geral e acompanha o progresso', async () => {
      const { user, activity } = await setup();
      const a = await createBlock(user, activity.id, { startTime: '06:00' });
      const b = await createBlock(user, activity.id, { startTime: '07:00' });
      await complete(user, a.id);
      await complete(user, b.id);

      const res = await getToday(user);
      expect(res.body.total).toMatchObject({ xp: 120, level: 2 });
      expect(res.body.total).toEqual((await getProgress(user)).body.total);
    });

    it('isola os usuários: A não vê os blocos nem o XP de B (RS06)', async () => {
      const a = await setup();
      const b = await setup();
      await complete(a.user, (await createBlock(a.user, a.activity.id)).id);

      const forB = (await getToday(b.user)).body;
      expect(forB.items).toHaveLength(0);
      expect(forB.xpToday).toBe(0);
    });
  });

  describe('conclusões na resposta da semana', () => {
    it('traz as conclusões ativas da semana, no contrato compartilhado', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      await complete(user, block.id);

      const res = await getWeek(user, '2026-10-05');

      expect(weekResponseSchema.safeParse(res.body).success).toBe(true);
      expect(res.body.completions).toEqual([
        { blockId: block.id, occurrenceDate: '2026-10-07', completedAt: NOON, xpAmount: 60 },
      ]);
    });

    it('a conclusão some quando é desfeita e volta quando refeita', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      await complete(user, block.id);
      await undo(user, block.id);
      expect((await getWeek(user, '2026-10-05')).body.completions).toEqual([]);

      await complete(user, block.id);
      expect((await getWeek(user, '2026-10-05')).body.completions).toHaveLength(1);
    });

    it('só aparece na semana da ocorrência, e só para quem concluiu', async () => {
      const a = await setup();
      const b = await setup();
      const block = await createBlock(a.user, a.activity.id);
      await complete(a.user, block.id);

      expect((await getWeek(a.user, '2026-10-12')).body.completions).toEqual([]);
      expect((await getWeek(b.user, '2026-10-05')).body.completions).toEqual([]);
    });

    it('semana sem conclusões devolve lista vazia', async () => {
      const { user } = await setup();
      expect((await getWeek(user, '2026-10-05')).body.completions).toEqual([]);
    });
  });
});
