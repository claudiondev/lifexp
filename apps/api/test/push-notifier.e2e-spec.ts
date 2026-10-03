import type { INestApplication } from '@nestjs/common';
import { vi } from 'vitest';
import request from 'supertest';
import { NotificationGenerator } from '../src/notifications/notification-generator.service.js';
import { NotificationsScheduler } from '../src/notifications/notifications.scheduler.js';
import {
  MAX_PUSH_ATTEMPTS,
  PUSH_FRESH_MIN,
  PushNotifier,
} from '../src/notifications/push-notifier.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  FakeClock,
  FakePushSender,
  bearer,
  createTestApp,
  listActivities,
  registerUser,
  scanWhenFree,
  withScanMutex,
  type TestUser,
} from './helpers.js';

// 07:00 em São Paulo (UTC-3) de quarta, 2026-10-07 = 10:00Z (hora do resumo).
const DIGEST_Z = '2026-10-07T10:00:20.000Z';
const keys = {
  p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
  auth: 'tBHItJI5svbpez7KI4CCXg',
};
let counter = 0;
const endpoint = () => `https://fcm.googleapis.com/fcm/send/notifier-${Date.now()}-${counter++}`;

describe('Push dos avisos (e2e, RF41)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let generator: NotificationGenerator;
  let notifier: PushNotifier;
  let scheduler: NotificationsScheduler;
  const sender = new FakePushSender();
  const clock = new FakeClock(DIGEST_Z);
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp({ clock, pushSender: sender });
    prisma = app.get(PrismaService);
    generator = app.get(NotificationGenerator);
    notifier = app.get(PushNotifier);
    scheduler = app.get(NotificationsScheduler);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => sender.reset());

  /** Uma pessoa com bloco semanal às quartas (gera o resumo e o lembrete), push ligado e um aparelho. */
  const setup = async (options: { push?: boolean; devices?: number } = {}) => {
    const { push = true, devices = 1 } = options;
    const user = await registerUser(app);
    const [activity] = await listActivities(app, user);
    await request(server()).post('/api/blocks').set(bearer(user)).send({
      recurrence: 'weekly',
      activityId: activity!.id,
      weekday: 3,
      startTime: '08:00',
      durationMin: 60,
      validFrom: '2026-09-02',
    });
    if (push) {
      await request(server())
        .put('/api/notification-preferences')
        .set(bearer(user))
        .send({ pushEnabled: true });
    }
    const endpoints: string[] = [];
    for (let i = 0; i < devices; i++) {
      const ep = endpoint();
      endpoints.push(ep);
      await prisma.pushSubscription.create({
        data: { userId: user.userId, endpoint: ep, ...keys },
      });
    }
    return { user, endpoints };
  };
  const digestOf = async (user: TestUser) => {
    await generator.scanUser(user.userId, new Date(DIGEST_Z));
    return prisma.notification.findFirstOrThrow({ where: { userId: user.userId, kind: 'DIGEST' } });
  };
  const sentTo = (endpoints: string[]) =>
    sender.sent.filter((entry) => endpoints.includes(entry.target.endpoint));
  const row = (id: string) => prisma.notification.findUniqueOrThrow({ where: { id } });
  const send = (at = DIGEST_Z) => notifier.sendPending(new Date(at));

  it('envia o aviso ao aparelho com título, texto, destino e etiqueta, e marca como enviado', async () => {
    const { user, endpoints } = await setup();
    const digest = await digestOf(user);

    const summary = await send();

    expect(summary.sent).toBeGreaterThanOrEqual(1);
    const [entry] = sentTo(endpoints);
    expect(entry!.target).toEqual({ endpoint: endpoints[0], keys });
    expect(entry!.payload).toEqual({
      title: 'Seu dia',
      body: digest.body,
      url: '/hoje',
      tag: digest.dedupeKey,
    });
    const after = await row(digest.id);
    expect(after.pushSentAt!.toISOString()).toBe(DIGEST_Z);
    expect(after.pushAttempts).toBe(1);
  });

  it('o lembrete de bloco leva à semana certa', async () => {
    const { user, endpoints } = await setup();
    // 07:45 locais = 10:45Z: o lembrete de 15 min do bloco das 08:00
    await generator.scanUser(user.userId, new Date('2026-10-07T10:45:20.000Z'));
    const reminder = await prisma.notification.findFirstOrThrow({
      where: { userId: user.userId, kind: 'BLOCK' },
    });

    await send('2026-10-07T10:45:30.000Z');

    const [entry] = sentTo(endpoints);
    expect(entry!.payload.url).toBe('/semana?inicio=2026-10-07');
    expect(entry!.payload.tag).toBe(reminder.dedupeKey);
  });

  it('não envia de novo o que já foi enviado', async () => {
    const { user, endpoints } = await setup();
    await digestOf(user);

    await send();
    await send('2026-10-07T10:01:20.000Z');

    expect(sentTo(endpoints)).toHaveLength(1);
  });

  it('é desligado por padrão: sem a preferência, nada é enviado (nem a tentativa é contada)', async () => {
    const { user, endpoints } = await setup({ push: false });
    const digest = await digestOf(user);

    await send();

    expect(sentTo(endpoints)).toHaveLength(0);
    expect((await row(digest.id)).pushAttempts).toBe(0);
  });

  it('sem aparelho inscrito, nada é enviado', async () => {
    const { user } = await setup({ devices: 0 });
    const digest = await digestOf(user);

    await send();

    expect(sender.sent.filter((s) => s.payload.tag === digest.dedupeKey)).toHaveLength(0);
    expect((await row(digest.id)).pushAttempts).toBe(0);
  });

  it('o que já foi lido no app não vira push', async () => {
    const { user, endpoints } = await setup();
    const digest = await digestOf(user);
    await prisma.notification.update({
      where: { id: digest.id },
      data: { readAt: new Date(DIGEST_Z) },
    });

    await send();
    expect(sentTo(endpoints)).toHaveLength(0);
  });

  it(`não envia aviso com mais de ${PUSH_FRESH_MIN} minutos, mas ainda envia dentro da janela`, async () => {
    const { user, endpoints } = await setup();
    await digestOf(user);

    await send('2026-10-07T10:31:00.000Z'); // 31 min depois de 07:00 locais
    expect(sentTo(endpoints)).toHaveLength(0);

    await send('2026-10-07T10:29:00.000Z'); // 29 min depois
    expect(sentTo(endpoints)).toHaveLength(1);
  });

  it('não envia o que ainda está agendado para o futuro', async () => {
    const { user, endpoints } = await setup();
    await digestOf(user);

    await send('2026-10-07T09:59:00.000Z'); // um minuto antes das 07:00 locais
    expect(sentTo(endpoints)).toHaveLength(0);
  });

  it('manda para todos os aparelhos e apaga o que o navegador cancelou', async () => {
    const { user, endpoints } = await setup({ devices: 3 });
    const digest = await digestOf(user);
    sender.outcomes.set(endpoints[2]!, 'gone');

    const summary = await send();

    expect(summary.removed).toBeGreaterThanOrEqual(1);
    expect(
      sentTo(endpoints)
        .map((s) => s.target.endpoint)
        .sort(),
    ).toEqual([endpoints[0], endpoints[1]].sort());
    expect(await prisma.pushSubscription.count({ where: { userId: user.userId } })).toBe(2);
    expect((await row(digest.id)).pushSentAt).not.toBeNull();
  });

  it('se ao menos um aparelho recebeu, o aviso conta como enviado (o outro não é repetido)', async () => {
    const { user, endpoints } = await setup({ devices: 2 });
    const digest = await digestOf(user);
    sender.outcomes.set(endpoints[1]!, 'failed');

    await send();
    await send('2026-10-07T10:01:20.000Z');

    expect(sentTo(endpoints)).toHaveLength(1);
    expect((await row(digest.id)).pushSentAt).not.toBeNull();
  });

  it('uma falha passageira é repetida no minuto seguinte, até dar certo', async () => {
    const { user, endpoints } = await setup();
    const digest = await digestOf(user);
    sender.defaultOutcome = 'failed';

    await send();
    let after = await row(digest.id);
    expect(after.pushSentAt).toBeNull();
    expect(after.pushAttempts).toBe(1);

    sender.defaultOutcome = 'sent';
    await send('2026-10-07T10:01:20.000Z');
    after = await row(digest.id);
    expect(after.pushSentAt).not.toBeNull();
    expect(after.pushAttempts).toBe(2);
    expect(sentTo(endpoints)).toHaveLength(1);
  });

  it(`desiste depois de ${MAX_PUSH_ATTEMPTS} tentativas, sem travar os outros`, async () => {
    const [ana, bia] = [await setup(), await setup()];
    const digestAna = await digestOf(ana.user);
    await digestOf(bia.user);
    sender.outcomes.set(ana.endpoints[0]!, 'failed');

    for (let minute = 0; minute < MAX_PUSH_ATTEMPTS + 2; minute += 1) {
      await send(`2026-10-07T10:0${minute}:20.000Z`);
    }

    const row1 = await row(digestAna.id);
    expect(row1.pushAttempts).toBe(MAX_PUSH_ATTEMPTS);
    expect(row1.pushSentAt).toBeNull();
    expect(sentTo(bia.endpoints)).toHaveLength(1);
  });

  it('sem chaves VAPID (sender desligado), não faz nada e não gasta tentativas', async () => {
    const { user, endpoints } = await setup();
    const digest = await digestOf(user);
    sender.enabled = false;

    expect(await send()).toEqual({ sent: 0, failed: 0, removed: 0 });
    expect(sentTo(endpoints)).toHaveLength(0);
    expect((await row(digest.id)).pushAttempts).toBe(0);
  });

  it('cada pessoa recebe só os próprios avisos, nos próprios aparelhos (um por aparelho)', async () => {
    const [ana, bia] = [await setup({ devices: 2 }), await setup({ devices: 1 })];
    await digestOf(ana.user);
    const biaDigest = await digestOf(bia.user);
    // o aviso da Bia vira diferente do da Ana, para provar quem recebeu o quê
    await prisma.notification.update({ where: { id: biaDigest.id }, data: { body: 'SÓ DA BIA' } });

    await send();

    expect(sentTo(ana.endpoints)).toHaveLength(2);
    expect(sentTo(bia.endpoints)).toHaveLength(1);
    expect(sentTo(ana.endpoints).every((s) => s.payload.body !== 'SÓ DA BIA')).toBe(true);
    expect(sentTo(bia.endpoints)[0]!.payload.body).toBe('SÓ DA BIA');
  });

  it('uma conta excluída no meio do envio não derruba a rodada', async () => {
    const { user, endpoints } = await setup();
    await digestOf(user);
    const real = await prisma.notification.findMany({
      where: { userId: user.userId, kind: 'DIGEST' },
      include: { user: { select: { pushSubscriptions: true } } },
    });
    const ghost = { ...real[0]!, id: '0192f1a0-7b3c-7000-8000-0000000000ff' };
    const spy = vi
      .spyOn(prisma.notification, 'findMany')
      .mockResolvedValueOnce([ghost, ...real] as never);

    const summary = await send();
    spy.mockRestore();

    expect(summary.failed).toBe(0);
    expect(sentTo(endpoints)).toHaveLength(1);
  });

  it(
    'o agendador gera e envia o push no mesmo minuto',
    () =>
      withScanMutex(async () => {
        const { endpoints } = await setup();

        const summary = await scanWhenFree(() => scheduler.runOnce(new Date(DIGEST_Z)));

        expect(summary.created).toBeGreaterThanOrEqual(1);
        expect(summary.pushed).toBeGreaterThanOrEqual(1);
        expect(sentTo(endpoints)).toHaveLength(1);
      }),
    120_000,
  );
});
