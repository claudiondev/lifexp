import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { completionResultSchema } from '@lifexp/shared';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  FakeClock,
  bearer,
  createTestApp,
  listActivities,
  registerUser,
  type TestUser,
} from './helpers.js';

// Quarta 2026-10-07 às 12:00 em São Paulo (UTC-3): o bloco das 09:00 já começou.
const NOON = '2026-10-07T15:00:00.000Z';

describe('Tempo de lazer ao concluir blocos (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const clock = new FakeClock(NOON);
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp({ clock });
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => clock.set(NOON));

  const setup = async () => {
    const user = await registerUser(app);
    const [activity] = await listActivities(app, user);
    return { user, activity: activity! };
  };

  const setPercent = (user: TestUser, activityId: string, leisurePercent: number | null) =>
    request(server())
      .patch(`/api/activities/${activityId}`)
      .set(bearer(user))
      .send({ leisurePercent });

  const createBlock = async (user: TestUser, activityId: string, durationMin = 120) =>
    (
      await request(server()).post('/api/blocks').set(bearer(user)).send({
        recurrence: 'weekly',
        activityId,
        weekday: 3,
        startTime: '09:00',
        durationMin,
        validFrom: '2026-09-02',
      })
    ).body as { id: string };

  const complete = (user: TestUser, blockId: string, date = '2026-10-07') =>
    request(server())
      .post(`/api/blocks/${blockId}/occurrences/${date}/completion`)
      .set(bearer(user));
  const undo = (user: TestUser, blockId: string, date = '2026-10-07') =>
    request(server())
      .delete(`/api/blocks/${blockId}/occurrences/${date}/completion`)
      .set(bearer(user));
  const leisureOf = async (blockId: string, date = '2026-10-07') =>
    (
      await prisma.completion.findUniqueOrThrow({
        where: { blockId_occurrenceDate: { blockId, occurrenceDate: new Date(date) } },
      })
    ).leisureMin;

  describe('proporção da atividade', () => {
    it('atividade nasce sem gerar lazer e a API devolve nulo', async () => {
      const { activity } = await setup();
      expect(activity).toMatchObject({ leisurePercent: null });
    });

    it('aceita 25, 50 e 100, e desligar com nulo', async () => {
      const { user, activity } = await setup();
      for (const value of [25, 50, 100, null]) {
        const res = await setPercent(user, activity.id, value);
        expect(res.status).toBe(200);
        expect(res.body.leisurePercent).toBe(value);
      }
    });

    it('recusa valores fora da lista com 400', async () => {
      const { user, activity } = await setup();
      for (const value of [0, 10, 75, 150, '50']) {
        expect((await setPercent(user, activity.id, value as number)).status).toBe(400);
      }
    });

    it('criar atividade já com a proporção', async () => {
      const { user, activity } = await setup();
      const res = await request(server())
        .post('/api/activities')
        .set(bearer(user))
        .send({ areaId: activity.areaId, name: 'Inglês', leisurePercent: 50 });
      expect(res.status).toBe(201);
      expect(res.body.leisurePercent).toBe(50);
    });

    it('atividade alheia responde 404', async () => {
      const a = await setup();
      const b = await setup();
      expect((await setPercent(b.user, a.activity.id, 50)).status).toBe(404);
      const row = await prisma.activity.findUniqueOrThrow({ where: { id: a.activity.id } });
      expect(row.leisurePercent).toBeNull();
    });
  });

  describe('ganho ao concluir', () => {
    it('2 h a 50% rendem 60 min, gravados na conclusão e devolvidos no resultado', async () => {
      const { user, activity } = await setup();
      await setPercent(user, activity.id, 50);
      const block = await createBlock(user, activity.id, 120);

      const res = await complete(user, block.id);
      expect(res.status).toBe(200);
      expect(completionResultSchema.parse(res.body).leisureEarnedMin).toBe(60);
      expect(await leisureOf(block.id)).toBe(60);
    });

    it('arredonda para baixo', async () => {
      const { user, activity } = await setup();
      await setPercent(user, activity.id, 25);
      const block = await createBlock(user, activity.id, 50); // 12,5
      expect((await complete(user, block.id)).body.leisureEarnedMin).toBe(12);
    });

    it('atividade que não gera lazer rende 0', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id, 120);
      const res = await complete(user, block.id);
      expect(res.body.leisureEarnedMin).toBe(0);
      expect(await leisureOf(block.id)).toBe(0);
    });

    it('concluir de novo não ganha nada a mais (idempotente)', async () => {
      const { user, activity } = await setup();
      await setPercent(user, activity.id, 100);
      const block = await createBlock(user, activity.id, 60);
      expect((await complete(user, block.id)).body.leisureEarnedMin).toBe(60);
      const again = await complete(user, block.id);
      expect(again.body).toMatchObject({ alreadyCompleted: true, leisureEarnedMin: 0 });
      expect(await leisureOf(block.id)).toBe(60);
    });

    it('a proporção fica congelada: mudá-la depois não altera o que já foi ganho', async () => {
      const { user, activity } = await setup();
      await setPercent(user, activity.id, 50);
      const block = await createBlock(user, activity.id, 120);
      await complete(user, block.id);

      await setPercent(user, activity.id, 100);
      expect(await leisureOf(block.id)).toBe(60);
      await setPercent(user, activity.id, null);
      expect(await leisureOf(block.id)).toBe(60);
    });

    it('desfazer e refazer recalcula com a proporção de agora', async () => {
      const { user, activity } = await setup();
      await setPercent(user, activity.id, 50);
      const block = await createBlock(user, activity.id, 120);
      await complete(user, block.id);
      await undo(user, block.id);

      await setPercent(user, activity.id, 25);
      expect((await complete(user, block.id)).body.leisureEarnedMin).toBe(30);
      expect(await leisureOf(block.id)).toBe(30);
    });

    it('usa a duração efetiva da ocorrência (alterada só nesse dia)', async () => {
      const { user, activity } = await setup();
      await setPercent(user, activity.id, 50);
      const block = await createBlock(user, activity.id, 120);
      const moved = await request(server())
        .put(`/api/blocks/${block.id}/exceptions/2026-10-07`)
        .set(bearer(user))
        .send({ type: 'override', newDurationMin: 60 });
      expect(moved.status).toBe(200);

      expect((await complete(user, block.id)).body.leisureEarnedMin).toBe(30);
    });
  });
});
