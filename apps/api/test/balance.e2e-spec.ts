import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { balanceSchema } from '@lifexp/shared';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { OccurrenceHistoryService } from '../src/gamification/occurrence-history.service.js';
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
const MON = '2026-10-05';
const TUE = '2026-10-06';
const WED = '2026-10-07';

describe('Radar de equilíbrio (e2e, RF24, RN40 a RN42)', () => {
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

  const setup = async () => {
    const user = await registerUser(app);
    const activities = await listActivities(app, user);
    return { user, a: activities[0]!, b: activities[1]! };
  };
  const balanceOf = async (user: TestUser) => {
    const res = await request(server()).get('/api/balance').set(bearer(user));
    expect(res.status).toBe(200);
    return balanceSchema.parse(res.body);
  };
  const scoreOf = async (user: TestUser, areaId: string) =>
    (await balanceOf(user)).areas.find((area) => area.areaId === areaId)!;
  const onceBlock = async (
    user: TestUser,
    activityId: string,
    date: string,
    durationMin = 60,
    startTime = '09:00',
  ) => {
    const res = await request(server())
      .post('/api/blocks')
      .set(bearer(user))
      .send({ recurrence: 'once', activityId, date, startTime, durationMin });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  };
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

  it('conta nova: todas as áreas ativas, sem nota ("sem dados", não zero), e a janela de 28 dias', async () => {
    const { user } = await setup();
    const balance = await balanceOf(user);

    expect(balance.windowStart).toBe('2026-09-10');
    expect(balance.windowEnd).toBe(WED);
    expect(balance.areas).toHaveLength(7);
    for (const area of balance.areas) {
      expect(area).toMatchObject({ planned: 0, completed: 0, score: null });
    }
  });

  it('bloco planejado e perdido (janela fechada) dá 0; concluído dá 100', async () => {
    const { user, a, b } = await setup();
    await onceBlock(user, a.id, MON); // perdido
    const done = await onceBlock(user, b.id, MON);
    await completeOn(user, done.id, MON);

    expect(await scoreOf(user, a.areaId)).toMatchObject({ planned: 1, completed: 0, score: 0 });
    expect(await scoreOf(user, b.areaId)).toMatchObject({ planned: 1, completed: 1, score: 100 });
  });

  it('o que ainda dá tempo de concluir (ontem e hoje) não puxa a nota para baixo', async () => {
    const { user, a } = await setup();
    await onceBlock(user, a.id, TUE);
    await onceBlock(user, a.id, WED);

    expect(await scoreOf(user, a.areaId)).toMatchObject({ planned: 0, score: null });

    const closed = await onceBlock(user, a.id, MON);
    await completeOn(user, closed.id, MON);
    expect(await scoreOf(user, a.areaId)).toMatchObject({ planned: 1, completed: 1, score: 100 });
  });

  it('concluir hoje já conta (concluído entra mesmo com a janela aberta)', async () => {
    const { user, a } = await setup();
    const block = await onceBlock(user, a.id, WED);
    await completeOn(user, block.id, WED);
    expect(await scoreOf(user, a.areaId)).toMatchObject({ planned: 1, completed: 1, score: 100 });
  });

  it('pular tira o bloco da conta (RN11) e restaurar o devolve', async () => {
    const { user, a } = await setup();
    const kept = await onceBlock(user, a.id, MON);
    const skipped = await onceBlock(user, a.id, MON, 60, '11:00');
    await completeOn(user, kept.id, MON);
    expect((await skip(user, skipped.id, MON)).status).toBe(200);

    expect(await scoreOf(user, a.areaId)).toMatchObject({ planned: 1, completed: 1, score: 100 });
  });

  it('RN42: conta blocos, não minutos: leitura curta (15 min) pesa tanto quanto treino longo', async () => {
    const { user, a, b } = await setup();
    const longo = await onceBlock(user, a.id, MON, 600);
    const curtos = [
      await onceBlock(user, b.id, MON, 15, '06:00'),
      await onceBlock(user, b.id, MON, 15, '07:00'),
      await onceBlock(user, b.id, MON, 15, '08:00'),
    ];
    await completeOn(user, longo.id, MON);
    await completeOn(user, curtos[0]!.id, MON);
    await completeOn(user, curtos[1]!.id, MON);

    expect(await scoreOf(user, a.areaId)).toMatchObject({ score: 100 });
    expect(await scoreOf(user, b.areaId)).toMatchObject({ planned: 3, completed: 2, score: 67 });
  });

  it('só as últimas 4 semanas: 27 dias atrás entra, 28 dias atrás não', async () => {
    const { user, a } = await setup();
    await onceBlock(user, a.id, '2026-09-10'); // 27 dias atrás: dentro
    await onceBlock(user, a.id, '2026-09-09'); // 28 dias atrás: fora

    expect(await scoreOf(user, a.areaId)).toMatchObject({ planned: 1, completed: 0, score: 0 });
  });

  it('série semanal: conta cada semana da janela', async () => {
    const { user, a } = await setup();
    const res = await request(server()).post('/api/blocks').set(bearer(user)).send({
      recurrence: 'weekly',
      activityId: a.id,
      weekday: 1,
      startTime: '09:00',
      durationMin: 60,
      validFrom: '2026-08-31',
    });
    expect(res.status).toBe(201);
    // segundas na janela já fechadas: 14/09, 21/09, 28/09 e 05/10 (07/09 está fora; 31/08 também)
    expect(await scoreOf(user, a.areaId)).toMatchObject({ planned: 4, completed: 0, score: 0 });
    await completeOn(user, res.body.id, '2026-09-21');
    await completeOn(user, res.body.id, '2026-09-28');
    expect(await scoreOf(user, a.areaId)).toMatchObject({ planned: 4, completed: 2, score: 50 });
  });

  it('as áreas saem na ordem da pessoa (posição), não na de criação', async () => {
    const { user } = await setup();
    const listed = await request(server()).get('/api/areas').set(bearer(user));
    const ids = (listed.body as { id: string }[]).map((area) => area.id);
    // a última área passa a ser a primeira: só uma ordenação explícita acerta isso
    await app
      .get(PrismaService)
      .area.update({ where: { id: ids.at(-1)! }, data: { position: -1 } });

    expect((await balanceOf(user)).areas.map((area) => area.areaId)).toEqual([
      ids.at(-1),
      ...ids.slice(0, -1),
    ]);
  });

  it('o histórico carregado respeita o início pedido (só as semanas necessárias)', async () => {
    const { user, a } = await setup();
    await request(server()).post('/api/blocks').set(bearer(user)).send({
      recurrence: 'weekly',
      activityId: a.id,
      weekday: 1,
      startTime: '09:00',
      durationMin: 60,
      validFrom: '2026-01-05',
    });
    const history = app.get(OccurrenceHistoryService);

    const all = await history.load(user.userId, WED);
    const recent = await history.load(user.userId, WED, '2026-09-10');
    expect(all.occurrences.length).toBeGreaterThan(30);
    // semana de 2026-09-10 começa na segunda 07/09: nada antes disso é calculado
    expect(recent.occurrences.map((o) => o.date).sort()[0]).toBe('2026-09-07');
    expect(recent.occurrences.length).toBeLessThan(10);
  });

  it('área arquivada sai do radar', async () => {
    const { user, a } = await setup();
    const archived = await request(server())
      .post(`/api/areas/${a.areaId}/archive`)
      .set(bearer(user));
    expect(archived.status).toBeLessThan(300);

    const balance = await balanceOf(user);
    expect(balance.areas).toHaveLength(6);
    expect(balance.areas.find((area) => area.areaId === a.areaId)).toBeUndefined();
  });

  it('é de cada pessoa: o histórico de uma não aparece no radar da outra', async () => {
    const { user: ana, a } = await setup();
    const { user: bia } = await setup();
    await onceBlock(ana, a.id, MON);

    expect(await scoreOf(ana, a.areaId)).toMatchObject({ planned: 1 });
    const other = await balanceOf(bia);
    expect(other.areas.every((area) => area.planned === 0 && area.score === null)).toBe(true);
    expect(other.areas.find((area) => area.areaId === a.areaId)).toBeUndefined();
  });

  it('usa o dia local da pessoa (fuso)', async () => {
    const { user } = await setup();
    await request(server())
      .patch('/api/users/me')
      .set(bearer(user))
      .send({ timezone: 'Pacific/Kiritimati' }); // UTC+14: 2026-10-07T15:00Z já é 05:00 do dia 08
    expect((await balanceOf(user)).windowEnd).toBe('2026-10-08');
  });

  it('exige autenticação', async () => {
    expect((await request(server()).get('/api/balance')).status).toBe(401);
  });
});
