import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { NotificationGenerator } from '../src/notifications/notification-generator.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  FakeClock,
  bearer,
  createTestApp,
  holdScanLock,
  listActivities,
  registerUser,
  type TestUser,
} from './helpers.js';
import { SCAN_LOCK_KEY } from '../src/notifications/notifications.scheduler.js';

// Quarta 2026-10-07 às 12:00 em São Paulo (UTC-3).
const NOON = '2026-10-07T15:00:00.000Z';

describe('Aviso de fim do tempo de lazer (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let generator: NotificationGenerator;
  let release: () => Promise<void>;
  const clock = new FakeClock(NOON);
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp({ clock });
    prisma = app.get(PrismaService);
    generator = app.get(NotificationGenerator);
    // A varredura de OUTRA suíte (mesmo banco, em paralelo) geraria os avisos deste teste antes dele.
    release = await holdScanLock(SCAN_LOCK_KEY);
  });
  afterAll(async () => {
    await release();
    await app.close();
  });
  beforeEach(() => clock.set(NOON));

  const at = (minutes: number) => new Date(new Date(NOON).getTime() + minutes * 60_000);

  const setup = async () => {
    const user = await registerUser(app);
    const [activity] = await listActivities(app, user);
    await request(server())
      .patch(`/api/activities/${activity!.id}`)
      .set(bearer(user))
      .send({ leisurePercent: 50 });
    const block = (
      await request(server()).post('/api/blocks').set(bearer(user)).send({
        recurrence: 'weekly',
        activityId: activity!.id,
        weekday: 3,
        startTime: '09:00',
        durationMin: 120,
        validFrom: '2026-09-02',
      })
    ).body as { id: string };
    await request(server())
      .post(`/api/blocks/${block.id}/occurrences/2026-10-07/completion`)
      .set(bearer(user));
    const option = (
      await request(server())
        .post('/api/leisure/options')
        .set(bearer(user))
        .send({ name: 'Instagram', icon: 'smartphone' })
    ).body as { id: string };
    return { user, option };
  };
  const start = async (user: TestUser, optionId: string) =>
    (await request(server()).post('/api/leisure/sessions').set(bearer(user)).send({ optionId }))
      .body as { id: string };
  const stop = (user: TestUser, id: string) =>
    request(server()).post(`/api/leisure/sessions/${id}/stop`).set(bearer(user));
  const notices = (user: TestUser) =>
    prisma.notification.findMany({ where: { userId: user.userId, kind: 'LEISURE_END' } });

  it('avisa uma vez quando o limite chega sem a pessoa parar', async () => {
    const { user, option } = await setup();
    const session = await start(user, option.id); // limite de 60 min

    expect(await generator.scanUser(user.userId, at(59))).toBe(0);
    expect(await notices(user)).toHaveLength(0);

    await generator.scanUser(user.userId, at(60));
    const [notice] = await notices(user);
    expect(notice).toMatchObject({
      title: 'Seu tempo de lazer acabou',
      dedupeKey: `leisure:${session.id}`,
      scheduledFor: at(60),
    });
    expect(notice!.body).toContain('Instagram');

    // varreduras seguintes não duplicam
    await generator.scanUser(user.userId, at(61));
    await generator.scanUser(user.userId, at(62));
    expect(await notices(user)).toHaveLength(1);
  });

  it('parar antes do limite nunca gera o aviso', async () => {
    const { user, option } = await setup();
    const session = await start(user, option.id);
    clock.set(at(20).toISOString());
    await stop(user, session.id);

    await generator.scanUser(user.userId, at(60));
    await generator.scanUser(user.userId, at(61));
    expect(await notices(user)).toHaveLength(0);
  });

  it('o aviso da sessão de outra pessoa não aparece para mim (RS06)', async () => {
    const a = await setup();
    const b = await setup();
    await start(a.user, a.option.id);

    await generator.scanUser(a.user.userId, at(60));
    await generator.scanUser(b.user.userId, at(60));
    expect(await notices(a.user)).toHaveLength(1);
    expect(await notices(b.user)).toHaveLength(0);
  });

  it('o aviso aparece na lista do app com o tipo leisure_end', async () => {
    const { user, option } = await setup();
    await start(user, option.id);
    await generator.scanUser(user.userId, at(60));

    clock.set(at(61).toISOString());
    const res = await request(server()).get('/api/notifications').set(bearer(user));
    expect(res.status).toBe(200);
    expect(res.body.items.map((n: { kind: string }) => n.kind)).toContain('leisure_end');
  });
});
