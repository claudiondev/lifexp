import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { consistencySchema } from '@lifexp/shared';
import {
  FakeClock,
  bearer,
  createTestApp,
  listActivities,
  registerUser,
  type TestUser,
} from './helpers.js';

/** Meio-dia em São Paulo (UTC-3) do dia civil dado. */
const noon = (date: string) => `${date}T15:00:00.000Z`;
const WED = '2026-10-07';
const MON = '2026-10-05';
const TUE = '2026-10-06';
const OLD = '2026-09-30'; // quarta da semana anterior: dia já fechado

describe('Mapa de constância (e2e)', () => {
  let app: INestApplication;
  const clock = new FakeClock(noon(WED));
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp({ clock });
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => clock.set(noon(WED)));

  const consistency = async (user: TestUser, query = '') => {
    const res = await request(server()).get(`/api/consistency${query}`).set(bearer(user));
    expect(res.status).toBe(200);
    return consistencySchema.parse(res.body);
  };
  const dayOf = async (user: TestUser, date: string, query = '') =>
    (await consistency(user, query)).days.find((day) => day.date === date)!;
  const onceBlock = async (
    user: TestUser,
    activityId: string,
    date: string,
    startTime = '09:00',
  ) => {
    const res = await request(server())
      .post('/api/blocks')
      .set(bearer(user))
      .send({ recurrence: 'once', activityId, date, startTime, durationMin: 60 });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  };
  /** Conclui no próprio dia do bloco (relógio em meio-dia daquele dia) e volta o relógio para hoje. */
  const completeOn = async (user: TestUser, blockId: string, date: string) => {
    clock.set(noon(date));
    const res = await request(server())
      .post(`/api/blocks/${blockId}/occurrences/${date}/completion`)
      .set(bearer(user));
    expect(res.status).toBe(200);
    clock.set(noon(WED));
  };
  const skip = (user: TestUser, blockId: string, date: string) =>
    request(server())
      .put(`/api/blocks/${blockId}/exceptions/${date}`)
      .set(bearer(user))
      .send({ type: 'skip' });

  it('exige login', async () => {
    expect((await request(server()).get('/api/consistency')).status).toBe(401);
  });

  it('conta nova: 26 semanas até hoje, um item por dia, todos zerados', async () => {
    const result = await consistency(await registerUser(app));
    expect(result.start).toBe('2026-04-13');
    expect(result.end).toBe(WED);
    expect(result.days).toHaveLength(25 * 7 + 3);
    expect(result.days[0]!.date).toBe('2026-04-13');
    expect(result.days.at(-1)!.date).toBe(WED);
    expect(result.days.every((day) => day.planned === 0 && day.completed === 0)).toBe(true);
  });

  it('bloco concluído conta como planejado e concluído no dia dele', async () => {
    const user = await registerUser(app);
    const [activity] = await listActivities(app, user);
    const block = await onceBlock(user, activity!.id, MON);
    await completeOn(user, block.id, MON);
    expect(await dayOf(user, MON)).toEqual({ date: MON, planned: 1, completed: 1 });
  });

  it('dia fechado sem conclusão conta como planejado, mas não como concluído', async () => {
    const user = await registerUser(app);
    const [activity] = await listActivities(app, user);
    await onceBlock(user, activity!.id, OLD);
    expect(await dayOf(user, OLD)).toEqual({ date: OLD, planned: 1, completed: 0 });
  });

  it('ontem e hoje ainda em tempo de concluir não aparecem como planejados', async () => {
    const user = await registerUser(app);
    const [activity] = await listActivities(app, user);
    await onceBlock(user, activity!.id, TUE);
    await onceBlock(user, activity!.id, WED);
    expect(await dayOf(user, TUE)).toMatchObject({ planned: 0, completed: 0 });
    expect(await dayOf(user, WED)).toMatchObject({ planned: 0, completed: 0 });
  });

  it('bloco pulado não conta (pular não pune)', async () => {
    const user = await registerUser(app);
    const [activity] = await listActivities(app, user);
    const kept = await onceBlock(user, activity!.id, OLD);
    const skipped = await onceBlock(user, activity!.id, OLD, '11:00');
    expect((await skip(user, skipped.id, OLD)).status).toBe(200);
    expect(kept.id).not.toBe(skipped.id);
    expect(await dayOf(user, OLD)).toEqual({ date: OLD, planned: 1, completed: 0 });
  });

  it('desfazer a conclusão tira o bloco do concluído e, se ainda estiver em tempo, do planejado', async () => {
    const user = await registerUser(app);
    const [activity] = await listActivities(app, user);
    const block = await onceBlock(user, activity!.id, WED);
    await completeOn(user, block.id, WED);
    expect(await dayOf(user, WED)).toMatchObject({ planned: 1, completed: 1 });

    const undo = await request(server())
      .delete(`/api/blocks/${block.id}/occurrences/${WED}/completion`)
      .set(bearer(user));
    expect(undo.status).toBe(200);
    expect(await dayOf(user, WED)).toMatchObject({ planned: 0, completed: 0 });
  });

  it('weeks muda a janela; fora de 4..53 dá 400', async () => {
    const user = await registerUser(app);
    const four = await consistency(user, '?weeks=4');
    expect(four.start).toBe('2026-09-14');
    expect(four.days).toHaveLength(3 * 7 + 3);
    expect((await consistency(user, '?weeks=53')).days).toHaveLength(52 * 7 + 3);
    for (const bad of ['3', '54', '0', 'abc', '5.5']) {
      const res = await request(server()).get(`/api/consistency?weeks=${bad}`).set(bearer(user));
      expect(res.status).toBe(400);
    }
  });

  it('só enxerga os blocos da própria pessoa (RS06)', async () => {
    const ana = await registerUser(app);
    const bia = await registerUser(app);
    const [activity] = await listActivities(app, ana);
    await onceBlock(ana, activity!.id, OLD);
    expect(await dayOf(ana, OLD)).toMatchObject({ planned: 1 });
    expect(await dayOf(bia, OLD)).toMatchObject({ planned: 0 });
  });
});
