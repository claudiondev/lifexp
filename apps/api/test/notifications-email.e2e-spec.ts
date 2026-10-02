import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  DigestEmailService,
  EMAIL_FRESH_HOURS,
  MAX_EMAIL_ATTEMPTS,
} from '../src/notifications/digest-email.service.js';
import { NotificationGenerator } from '../src/notifications/notification-generator.service.js';
import { NotificationsScheduler } from '../src/notifications/notifications.scheduler.js';
import {
  FakeClock,
  FakeMailer,
  bearer,
  createTestApp,
  listActivities,
  registerUser,
  scanWhenFree,
  type TestUser,
} from './helpers.js';

// 07:00 em São Paulo (UTC-3) de quarta, 2026-10-07 = 10:00Z (hora do resumo).
const DIGEST_Z = '2026-10-07T10:00:20.000Z';

describe('Resumo diário por e-mail (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let generator: NotificationGenerator;
  let emails: DigestEmailService;
  let scheduler: NotificationsScheduler;
  const mailer = new FakeMailer();
  const clock = new FakeClock(DIGEST_Z);
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp({ clock, mailer });
    prisma = app.get(PrismaService);
    generator = app.get(NotificationGenerator);
    emails = app.get(DigestEmailService);
    scheduler = app.get(NotificationsScheduler);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    mailer.sent.length = 0;
    mailer.failNext = 0;
  });

  const setup = async (emailEnabled = true) => {
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
    if (emailEnabled) {
      await request(server())
        .put('/api/notification-preferences')
        .set(bearer(user))
        .send({ digestEmailEnabled: true });
    }
    return { user, activity: activity! };
  };
  /** Gera o resumo da pessoa e devolve a notificação. */
  const digestOf = async (user: TestUser) => {
    await generator.scanUser(user.userId, new Date(DIGEST_Z));
    return prisma.notification.findFirstOrThrow({
      where: { userId: user.userId, kind: 'DIGEST' },
    });
  };
  const mailsTo = (user: TestUser) => mailer.sent.filter((mail) => mail.to === user.email);

  it('envia o resumo para quem ligou a opção, com o conteúdo do aviso e o link do app', async () => {
    const { user, activity } = await setup();
    const digest = await digestOf(user);

    const summary = await emails.sendPending(new Date(DIGEST_Z));

    expect(summary.sent).toBeGreaterThanOrEqual(1);
    const [mail] = mailsTo(user);
    expect(mail).toBeDefined();
    expect(mail!.subject).toBe('Seu dia no LifeXP');
    expect(mail!.text).toContain(digest.body);
    expect(mail!.text).toContain(`${activity.name}, às 08:00`);
    expect(mail!.text).toContain('http://localhost:5173/hoje');
    const row = await prisma.notification.findUniqueOrThrow({ where: { id: digest.id } });
    expect(row.emailSentAt!.toISOString()).toBe(DIGEST_Z);
    expect(row.emailAttempts).toBe(1);
  });

  it('é desligado por padrão: sem a preferência, nada é enviado', async () => {
    const { user } = await setup(false);
    const digest = await digestOf(user);

    await emails.sendPending(new Date(DIGEST_Z));

    expect(mailsTo(user)).toHaveLength(0);
    const row = await prisma.notification.findUniqueOrThrow({ where: { id: digest.id } });
    expect(row.emailSentAt).toBeNull();
    expect(row.emailAttempts).toBe(0);
  });

  it('não envia de novo o que já foi enviado', async () => {
    const { user } = await setup();
    await digestOf(user);

    await emails.sendPending(new Date(DIGEST_Z));
    await emails.sendPending(new Date('2026-10-07T10:01:20.000Z'));
    await emails.sendPending(new Date('2026-10-07T10:02:20.000Z'));

    expect(mailsTo(user)).toHaveLength(1);
  });

  it('só o resumo vai por e-mail, nunca lembretes de bloco ou de evento', async () => {
    const { user } = await setup();
    await prisma.notification.create({
      data: {
        userId: user.userId,
        kind: 'EVENT',
        title: 'Consulta amanhã',
        body: 'corpo',
        scheduledFor: new Date(DIGEST_Z),
        dedupeKey: 'event:x:2026-10-08:all-day:1440',
        eventId: 'x',
      },
    });

    await emails.sendPending(new Date(DIGEST_Z));

    expect(mailsTo(user)).toHaveLength(0);
  });

  it('uma falha do provedor é repetida no minuto seguinte, até dar certo', async () => {
    const { user } = await setup();
    const digest = await digestOf(user);
    mailer.failNext = 1;

    const first = await emails.sendPending(new Date(DIGEST_Z));
    expect(first.failed).toBeGreaterThanOrEqual(1);
    let row = await prisma.notification.findUniqueOrThrow({ where: { id: digest.id } });
    expect(row.emailSentAt).toBeNull();
    expect(row.emailAttempts).toBe(1);

    await emails.sendPending(new Date('2026-10-07T10:01:20.000Z'));
    row = await prisma.notification.findUniqueOrThrow({ where: { id: digest.id } });
    expect(row.emailSentAt).not.toBeNull();
    expect(row.emailAttempts).toBe(2);
    expect(mailsTo(user)).toHaveLength(1);
  });

  it(`desiste depois de ${MAX_EMAIL_ATTEMPTS} tentativas, sem travar os outros`, async () => {
    const [ana, bia] = [await setup(), await setup()];
    const digestAna = await digestOf(ana.user);
    await digestOf(bia.user);
    // o provedor falha só para a Ana
    const original = mailer.send.bind(mailer);
    mailer.send = async (message) => {
      if (message.to === ana.user.email) throw new Error('recusou');
      return original(message);
    };
    try {
      for (let minute = 0; minute < MAX_EMAIL_ATTEMPTS + 2; minute += 1) {
        await emails.sendPending(new Date(`2026-10-07T10:0${minute}:20.000Z`));
      }
    } finally {
      mailer.send = original;
    }

    const row = await prisma.notification.findUniqueOrThrow({ where: { id: digestAna.id } });
    expect(row.emailAttempts).toBe(MAX_EMAIL_ATTEMPTS);
    expect(row.emailSentAt).toBeNull();
    expect(mailsTo(ana.user)).toHaveLength(0);
    expect(mailsTo(bia.user)).toHaveLength(1);
  });

  it(`não envia um resumo com mais de ${EMAIL_FRESH_HOURS} horas`, async () => {
    const { user } = await setup();
    await digestOf(user);

    await emails.sendPending(new Date('2026-10-07T13:00:21.000Z')); // 3 h e 1 s depois

    expect(mailsTo(user)).toHaveLength(0);
  });

  it('ainda envia dentro da janela de frescor', async () => {
    const { user } = await setup();
    await digestOf(user);

    await emails.sendPending(new Date('2026-10-07T12:59:00.000Z'));

    expect(mailsTo(user)).toHaveLength(1);
  });

  it('varreduras simultâneas (duas instâncias, sob a trava) não mandam o mesmo e-mail duas vezes', async () => {
    const { user } = await setup();

    // uma delas insiste até a trava ficar livre (outra suíte pode estar varrendo); as demais disputam
    await Promise.all([
      scanWhenFree(() => scheduler.runOnce(new Date(DIGEST_Z))),
      ...Array.from({ length: 4 }, () => scheduler.runOnce(new Date(DIGEST_Z))),
    ]);

    expect(mailsTo(user)).toHaveLength(1);
    expect(await prisma.notification.count({ where: { userId: user.userId } })).toBe(1);
  }, 120_000);

  it('cada resumo vai para o endereço da própria pessoa', async () => {
    const [ana, bia] = [await setup(), await setup()];
    await digestOf(ana.user);
    await digestOf(bia.user);

    await emails.sendPending(new Date(DIGEST_Z));

    expect(mailsTo(ana.user)).toHaveLength(1);
    expect(mailsTo(bia.user)).toHaveLength(1);
    expect(mailsTo(ana.user)[0]!.text).toContain(ana.user.email ? 'Olá,' : '');
  });

  it('o agendador gera e envia no mesmo minuto', async () => {
    const { user } = await setup();

    const summary = await scanWhenFree(() => scheduler.runOnce(new Date(DIGEST_Z)));

    expect(summary.created).toBeGreaterThanOrEqual(1);
    expect(summary.emailed).toBeGreaterThanOrEqual(1);
    expect(mailsTo(user)).toHaveLength(1);
  }, 120_000);
});
