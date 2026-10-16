import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { xpEvolutionSchema } from '@lifexp/shared';
import {
  FakeClock,
  bearer,
  createTestApp,
  listActivities,
  registerUser,
  type TestUser,
} from './helpers.js';

const NOON = '2026-10-07T15:00:00.000Z'; // quarta 12:00 em São Paulo (semana de 2026-10-05)

describe('Evolução do XP por semana (e2e)', () => {
  let app: INestApplication;
  const clock = new FakeClock(NOON);
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp({ clock });
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => clock.set(NOON));

  const evolution = async (user: TestUser, query = '') => {
    const res = await request(server()).get(`/api/xp/evolution${query}`).set(bearer(user));
    expect(res.status).toBe(200);
    return xpEvolutionSchema.parse(res.body);
  };

  /** Bloco avulso de 60 min às `startTime` (09:00) de `date`, concluído no instante atual do relógio: +60 XP. */
  const completeBlock = async (
    user: TestUser,
    date: string,
    activityIndex = 0,
    startTime = '09:00',
  ) => {
    const activity = (await listActivities(app, user))[activityIndex]!;
    const block = await request(server()).post('/api/blocks').set(bearer(user)).send({
      recurrence: 'once',
      activityId: activity.id,
      date,
      startTime,
      durationMin: 60,
    });
    expect(block.status).toBe(201);
    const path = `/api/blocks/${block.body.id}/occurrences/${date}/completion`;
    const done = await request(server()).post(path).set(bearer(user));
    expect(done.status).toBeLessThan(300);
    return {
      activity,
      undo: () => request(server()).delete(path).set(bearer(user)),
    };
  };

  it('exige login', async () => {
    expect((await request(server()).get('/api/xp/evolution')).status).toBe(401);
  });

  it('conta nova: 8 semanas zeradas, da mais antiga para a atual', async () => {
    const result = await evolution(await registerUser(app));
    expect(result.today).toBe('2026-10-07');
    expect(result.weeks).toHaveLength(8);
    expect(result.weeks[0]!.weekStart).toBe('2026-08-17');
    expect(result.weeks.at(-1)!.weekStart).toBe('2026-10-05');
    expect(result.weeks.every((week) => week.net === 0 && week.byArea.length === 0)).toBe(true);
  });

  it('o XP aparece na semana em que foi ganho, com a área da atividade', async () => {
    const user = await registerUser(app);
    clock.set('2026-09-30T15:00:00.000Z'); // quarta da semana anterior
    const { activity } = await completeBlock(user, '2026-09-30');
    clock.set(NOON);
    await completeBlock(user, '2026-10-07', 1);

    const { weeks } = await evolution(user);
    const [previous, current] = weeks.slice(-2);
    expect(previous).toMatchObject({ weekStart: '2026-09-28', gained: 60, reverted: 0, net: 60 });
    expect(previous!.byArea).toEqual([
      expect.objectContaining({ areaId: activity.areaId, amount: 60 }),
    ]);
    expect(current).toMatchObject({ weekStart: '2026-10-05', net: 60 });
    expect(current!.byArea[0]!.areaId).not.toBe(activity.areaId);
    expect(weeks.slice(0, -2).every((week) => week.net === 0)).toBe(true);
  });

  it('desfazer na mesma semana deixa o líquido em zero, mas mostra ganho e estorno', async () => {
    const user = await registerUser(app);
    const { undo } = await completeBlock(user, '2026-10-07');
    expect((await undo()).status).toBeLessThan(300);

    const current = (await evolution(user)).weeks.at(-1)!;
    expect(current).toMatchObject({ gained: 60, reverted: 60, net: 0, byArea: [] });
  });

  it('estornar na semana seguinte XP ganho antes tira da semana do estorno', async () => {
    const user = await registerUser(app);
    // Domingo ganha; segunda desfaz (a janela vai até o fim do dia seguinte ao bloco).
    clock.set('2026-10-11T15:00:00.000Z');
    const { undo } = await completeBlock(user, '2026-10-11');
    clock.set('2026-10-12T15:00:00.000Z');
    expect((await undo()).status).toBeLessThan(300);

    const [previous, current] = (await evolution(user)).weeks.slice(-2);
    expect(previous).toMatchObject({ weekStart: '2026-10-05', gained: 60, reverted: 0, net: 60 });
    expect(current).toMatchObject({ weekStart: '2026-10-12', gained: 0, reverted: 60, net: -60 });
  });

  it('a semana vai de segunda a segunda no fuso da pessoa (domingo 23:30 ≠ segunda 00:30)', async () => {
    const user = await registerUser(app); // fuso padrão: São Paulo (UTC-3)
    clock.set('2026-10-12T02:30:00.000Z'); // domingo 23:30 em São Paulo
    await completeBlock(user, '2026-10-11');
    clock.set('2026-10-12T03:30:00.000Z'); // segunda 00:30 em São Paulo
    await completeBlock(user, '2026-10-12', 1, '00:00');

    const [sunday, monday] = (await evolution(user)).weeks.slice(-2);
    expect(sunday).toMatchObject({ weekStart: '2026-10-05', net: 60 });
    expect(monday).toMatchObject({ weekStart: '2026-10-12', net: 60 });
  });

  it('weeks muda o tamanho da janela; valores fora de 2..26 dão 400', async () => {
    const user = await registerUser(app);
    expect((await evolution(user, '?weeks=2')).weeks).toHaveLength(2);
    expect((await evolution(user, '?weeks=26')).weeks).toHaveLength(26);
    for (const bad of ['1', '27', '0', 'abc', '3.5']) {
      const res = await request(server()).get(`/api/xp/evolution?weeks=${bad}`).set(bearer(user));
      expect(res.status).toBe(400);
    }
  });

  it('só enxerga o XP da própria pessoa (RS06)', async () => {
    const ana = await registerUser(app);
    const bia = await registerUser(app);
    await completeBlock(ana, '2026-10-07');

    expect((await evolution(ana)).weeks.at(-1)!.net).toBe(60);
    expect((await evolution(bia)).weeks.every((week) => week.net === 0)).toBe(true);
  });
});
