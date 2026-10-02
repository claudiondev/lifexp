import type { INestApplication } from '@nestjs/common';
import { vi } from 'vitest';
import request from 'supertest';
import { notificationPageSchema } from '@lifexp/shared';
import { NotificationGenerator } from '../src/notifications/notification-generator.service.js';
import { ReportsService } from '../src/reviews/reports.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  FakeClock,
  bearer,
  createTestApp,
  listActivities,
  registerUser,
  type TestUser,
} from './helpers.js';

// Segunda 2026-10-12, 07:00 em São Paulo (UTC-3) = 10:00Z. A semana que acabou começou em 2026-10-05.
const MONDAY_Z = '2026-10-12T10:00:20.000Z';
const noon = (date: string) => `${date}T15:00:00.000Z`;

describe('Aviso do relatório semanal (e2e, RF47)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let generator: NotificationGenerator;
  const clock = new FakeClock(MONDAY_Z);
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp({ clock });
    prisma = app.get(PrismaService);
    generator = app.get(NotificationGenerator);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => clock.set(MONDAY_Z));

  const setup = async () => {
    const user = await registerUser(app);
    const [activity] = await listActivities(app, user);
    return { user, activity: activity! };
  };
  /** Um bloco avulso e, se pedido, a conclusão dele (no próprio dia). */
  const block = async (user: TestUser, activityId: string, date: string, complete: boolean) => {
    const created = await request(server())
      .post('/api/blocks')
      .set(bearer(user))
      .send({ recurrence: 'once', activityId, date, startTime: '09:00', durationMin: 60 });
    expect(created.status).toBe(201);
    if (complete) {
      clock.set(noon(date));
      const done = await request(server())
        .post(`/api/blocks/${created.body.id}/occurrences/${date}/completion`)
        .set(bearer(user));
      expect(done.status).toBe(200);
      clock.set(MONDAY_Z);
    }
  };
  const reportsOf = async (user: TestUser) =>
    (await prisma.notification.findMany({ where: { userId: user.userId, kind: 'REPORT' } })).filter(
      (row) => row.dedupeKey === 'report:2026-10-05',
    );
  const scan = (user: TestUser, at = MONDAY_Z) => generator.scanUser(user.userId, new Date(at));

  it('na segunda, na hora do resumo, avisa do relatório da semana que acabou, com os números', async () => {
    const { user, activity } = await setup();
    await block(user, activity.id, '2026-10-05', true);
    await block(user, activity.id, '2026-10-06', true);
    await block(user, activity.id, '2026-10-07', false); // perdido

    await scan(user);

    const [row] = await reportsOf(user);
    expect(row).toMatchObject({
      kind: 'REPORT',
      title: 'Seu relatório da semana',
      blockId: null,
      eventId: null,
      occurrenceDate: null,
    });
    expect(row!.body).toMatch(
      /^Semana de 05\/10: 2 de 3 blocos \(67%\) e \+\d+ XP\. Veja o relatório completo\.$/,
    );
    expect(row!.scheduledFor.toISOString()).toBe('2026-10-12T10:00:00.000Z');
  });

  it('usa o instante da varredura, não o relógio da aplicação (a API pode estar atrasada ou recuperando)', async () => {
    const { user, activity } = await setup();
    await block(user, activity.id, '2026-10-05', true);
    // o relógio da aplicação ficou numa data anterior à semana do relatório, mas a varredura processa a segunda
    clock.set(noon('2026-09-30'));

    await scan(user);

    expect(await reportsOf(user)).toHaveLength(1);
  });

  it('aparece na central como "report"', async () => {
    const { user, activity } = await setup();
    await block(user, activity.id, '2026-10-05', true);
    await scan(user);

    const res = await request(server()).get('/api/notifications').set(bearer(user));
    expect(res.status).toBe(200);
    const page = notificationPageSchema.parse(res.body);
    expect(page.items.map((n) => n.kind)).toContain('report');
  });

  it('é idempotente: varrer de novo (ou dentro da janela de 1 h) não duplica nem remonta o relatório', async () => {
    const { user, activity } = await setup();
    await block(user, activity.id, '2026-10-05', true);
    const weekly = vi.spyOn(app.get(ReportsService), 'weekly');

    await scan(user);
    await scan(user, '2026-10-12T10:01:20.000Z');
    await scan(user, '2026-10-12T10:30:20.000Z');

    expect(await reportsOf(user)).toHaveLength(1);
    expect(weekly).toHaveBeenCalledTimes(1);
    weekly.mockRestore();
  });

  it('em outro dia, antes da hora ou depois da janela não gera', async () => {
    const { user, activity } = await setup();
    await block(user, activity.id, '2026-10-05', true);

    await scan(user, '2026-10-13T10:00:20.000Z'); // terça
    await scan(user, '2026-10-12T09:30:20.000Z'); // antes das 07:00
    await scan(user, '2026-10-12T12:00:20.000Z'); // 2 h depois (fora da janela de 1 h)
    expect(await reportsOf(user)).toHaveLength(0);
  });

  it('semana sem nenhum bloco contado não gera aviso', async () => {
    const { user } = await setup();
    await scan(user);
    expect(await reportsOf(user)).toHaveLength(0);
  });

  it('desligado nas preferências, não gera', async () => {
    const { user, activity } = await setup();
    await block(user, activity.id, '2026-10-05', true);
    const off = await request(server())
      .put('/api/notification-preferences')
      .set(bearer(user))
      .send({ weeklyReportEnabled: false });
    expect(off.body.weeklyReportEnabled).toBe(false);

    await scan(user);
    expect(await reportsOf(user)).toHaveLength(0);
  });

  it('usa a hora do resumo configurada pela pessoa', async () => {
    const { user, activity } = await setup();
    await block(user, activity.id, '2026-10-05', true);
    await request(server())
      .put('/api/notification-preferences')
      .set(bearer(user))
      .send({ digestTime: '09:00' }); // 12:00Z

    await scan(user); // 07:00: ainda não é a hora dela
    expect(await reportsOf(user)).toHaveLength(0);
    await scan(user, '2026-10-12T12:00:20.000Z');
    expect(await reportsOf(user)).toHaveLength(1);
  });

  it('o relatório é só da própria pessoa: o de uma não vaza para a outra', async () => {
    const { user: ana, activity } = await setup();
    const { user: bia } = await setup();
    await block(ana, activity.id, '2026-10-05', true);

    await scan(ana);
    await scan(bia);

    expect(await reportsOf(ana)).toHaveLength(1);
    expect(await reportsOf(bia)).toHaveLength(0);
  });
});
