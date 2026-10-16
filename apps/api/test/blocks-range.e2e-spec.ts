import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { addDays, weekResponseSchema } from '@lifexp/shared';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  FakeClock,
  bearer,
  createTestApp,
  listActivities,
  registerUser,
  type TestUser,
} from './helpers.js';

const MON = '2026-10-05';
// Quinta 12:00 em São Paulo: o bloco de quarta (2026-10-07) já começou e dá para concluir.
const NOW = '2026-10-08T15:00:00.000Z';

describe('Blocos de várias semanas, para o mês (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp({ clock: new FakeClock(NOW) });
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  const setup = async () => {
    const user = await registerUser(app);
    const [activity] = await listActivities(app, user);
    return { user, activity: activity! };
  };
  const post = (user: TestUser, path: string, body: object) =>
    request(server()).post(path).set(bearer(user)).send(body);
  const range = (user: TestUser, weekStart: string, weeks: number | string) =>
    request(server())
      .get(`/api/blocks/range?weekStart=${weekStart}&weeks=${weeks}`)
      .set(bearer(user));
  const week = (user: TestUser, weekStart: string) =>
    request(server()).get(`/api/blocks/week?weekStart=${weekStart}`).set(bearer(user));
  const weekly = (activityId: string, over: object = {}) => ({
    recurrence: 'weekly',
    activityId,
    weekday: 3,
    startTime: '09:00',
    durationMin: 60,
    validFrom: '2026-09-01',
    ...over,
  });
  const once = (activityId: string, date: string) => ({
    recurrence: 'once',
    activityId,
    date,
    startTime: '10:00',
    durationMin: 30,
  });

  it('exige login', async () => {
    expect((await request(server()).get(`/api/blocks/range?weekStart=${MON}&weeks=2`)).status).toBe(
      401,
    );
  });

  it('devolve as ocorrências de todas as semanas pedidas, no contrato do schema', async () => {
    const { user, activity } = await setup();
    await post(user, '/api/blocks', weekly(activity.id)); // toda quarta
    const res = await range(user, MON, 5);
    expect(res.status).toBe(200);
    const body = weekResponseSchema.parse(res.body);

    expect(body.weekStart).toBe(MON);
    expect(body.weekEnd).toBe(addDays(MON, 5 * 7 - 1));
    expect(body.occurrences.map((occurrence) => occurrence.date)).toEqual([
      '2026-10-07',
      '2026-10-14',
      '2026-10-21',
      '2026-10-28',
      '2026-11-04',
    ]);
  });

  it('uma semana só dá o mesmo resultado de /blocks/week', async () => {
    const { user, activity } = await setup();
    await post(user, '/api/blocks', weekly(activity.id));
    await post(user, '/api/blocks', once(activity.id, '2026-10-08'));
    expect((await range(user, MON, 1)).body).toEqual((await week(user, MON)).body);
  });

  it('o intervalo respeita a vigência: série que termina no meio some das semanas seguintes', async () => {
    const { user, activity } = await setup();
    await post(user, '/api/blocks', weekly(activity.id, { validUntil: '2026-10-20' }));
    const dates = (await range(user, MON, 4)).body.occurrences.map((o: { date: string }) => o.date);
    expect(dates).toEqual(['2026-10-07', '2026-10-14']);
  });

  it('inclui exceções (pular) e conclusões do intervalo', async () => {
    const { user, activity } = await setup();
    const skipped = (await post(user, '/api/blocks', once(activity.id, '2026-10-14'))).body;
    const kept = (await post(user, '/api/blocks', once(activity.id, '2026-10-21'))).body;
    await request(server())
      .put(`/api/blocks/${skipped.id}/exceptions/2026-10-14`)
      .set(bearer(user))
      .send({ type: 'skip' });
    const finished = (await post(user, '/api/blocks', once(activity.id, '2026-10-07'))).body;
    const done = await request(server())
      .post(`/api/blocks/${finished.id}/occurrences/2026-10-07/completion`)
      .set(bearer(user));
    expect(done.status).toBe(200);

    const body = weekResponseSchema.parse((await range(user, MON, 3)).body);
    const byBlock = new Map(body.occurrences.map((occurrence) => [occurrence.blockId, occurrence]));
    expect(byBlock.get(skipped.id)?.skipped).toBe(true);
    expect(byBlock.get(kept.id)?.skipped).toBe(false);
    expect(body.completions.map((completion) => completion.blockId)).toEqual([finished.id]);
  });

  it('só enxerga os blocos da própria pessoa (RS06)', async () => {
    const a = await setup();
    const b = await registerUser(app);
    await post(a.user, '/api/blocks', weekly(a.activity.id));
    expect((await range(a.user, MON, 2)).body.occurrences).toHaveLength(2);
    expect((await range(b, MON, 2)).body.occurrences).toHaveLength(0);
  });

  it('weeks fora de 1..6 e weekStart que não é segunda dão 400', async () => {
    const { user } = await setup();
    for (const bad of ['0', '7', '-1', 'abc', '2.5']) {
      expect((await range(user, MON, bad)).status).toBe(400);
    }
    expect((await range(user, '2026-10-07', 2)).status).toBe(400);
    expect(
      (await request(server()).get(`/api/blocks/range?weekStart=${MON}`).set(bearer(user))).status,
    ).toBe(400);
  });

  it('continua sendo UMA query, não importa o número de semanas nem de blocos (RNF04)', async () => {
    const { user, activity } = await setup();
    const queries: string[] = [];
    let counting = false;
    (prisma as unknown as { $on(e: 'query', cb: (q: { query: string }) => void): void }).$on(
      'query',
      (event) => {
        if (counting && !event.query.includes('"Session"')) queries.push(event.query);
      },
    );
    const countFor = async (weeks: number) => {
      queries.length = 0;
      counting = true;
      await range(user, MON, weeks);
      counting = false;
      return queries.length;
    };

    await post(user, '/api/blocks', weekly(activity.id));
    const one = await countFor(1);
    for (let i = 0; i < 10; i++) {
      await post(user, '/api/blocks', weekly(activity.id, { weekday: (i % 7) + 1 }));
    }
    const sixWithMany = await countFor(6);
    expect(one).toBe(1);
    expect(sixWithMany).toBe(1);
  });
});
