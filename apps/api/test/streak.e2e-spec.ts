import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { progressSchema } from '@lifexp/shared';
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

/** Meio-dia em São Paulo (UTC-3) do dia civil dado. */
const noon = (date: string) => `${date}T15:00:00.000Z`;
// Semana de 2026-10-05 (segunda) a 2026-10-11 (domingo).
const MON = '2026-10-05';
const TUE = '2026-10-06';
const WED = '2026-10-07';
const THU = '2026-10-08';
const FRI = '2026-10-09';

describe('Streak (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const clock = new FakeClock(noon(WED));
  const server = () => app.getHttpServer();
  const usersToCheck: string[] = [];

  beforeAll(async () => {
    app = await createTestApp({ clock });
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => clock.set(noon(WED)));
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

  /** Bloco avulso às 09:00 do dia dado. */
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
  const complete = (user: TestUser, blockId: string, date: string) =>
    request(server())
      .post(`/api/blocks/${blockId}/occurrences/${date}/completion`)
      .set(bearer(user));
  const undo = (user: TestUser, blockId: string, date: string) =>
    request(server())
      .delete(`/api/blocks/${blockId}/occurrences/${date}/completion`)
      .set(bearer(user));
  const skip = (user: TestUser, blockId: string, date: string) =>
    request(server())
      .put(`/api/blocks/${blockId}/exceptions/${date}`)
      .set(bearer(user))
      .send({ type: 'skip' });
  const streakOf = async (user: TestUser) => {
    const res = await request(server()).get('/api/progress').set(bearer(user));
    expect(res.status).toBe(200);
    const { current, best, lastFulfilledDate } = progressSchema.parse(res.body).streak;
    return { current, best, lastFulfilledDate };
  };
  const jokerOf = async (user: TestUser) => {
    const res = await request(server()).get('/api/progress').set(bearer(user));
    expect(res.status).toBe(200);
    return progressSchema.parse(res.body).streak.joker;
  };
  /** Conclui o bloco estando "no dia" dado (meio-dia em São Paulo). */
  const completeOn = async (user: TestUser, blockId: string, date: string) => {
    clock.set(noon(date));
    const res = await complete(user, blockId, date);
    expect(res.status).toBe(200);
  };

  it('conta nova: streak zerado', async () => {
    const { user } = await setup();
    expect(await streakOf(user)).toEqual({ current: 0, best: 0, lastFulfilledDate: null });
  });

  it('só com blocos planejados e nada cumprido, continua zerado', async () => {
    const { user, activity } = await setup();
    await onceBlock(user, activity.id, WED);
    expect(await streakOf(user)).toEqual({ current: 0, best: 0, lastFulfilledDate: null });
  });

  it('concluir o bloco do dia avança o streak e desfazer o reverte', async () => {
    const { user, activity } = await setup();
    const block = await onceBlock(user, activity.id, WED);

    await completeOn(user, block.id, WED);
    expect(await streakOf(user)).toEqual({ current: 1, best: 1, lastFulfilledDate: WED });

    expect((await undo(user, block.id, WED)).status).toBe(200);
    expect(await streakOf(user)).toEqual({ current: 0, best: 0, lastFulfilledDate: null });
  });

  it('um bloco cumprido basta, mesmo com outros do dia por cumprir', async () => {
    const { user, activity, other } = await setup();
    const done = await onceBlock(user, activity.id, WED);
    await onceBlock(user, other.id, WED, '14:00');

    await completeOn(user, done.id, WED);
    expect((await streakOf(user)).current).toBe(1);
  });

  it('dia sem bloco planejado é neutro: não quebra nem avança (RN13)', async () => {
    const { user, activity } = await setup();
    const monday = await onceBlock(user, activity.id, MON);
    const wednesday = await onceBlock(user, activity.id, WED); // terça sem nada

    await completeOn(user, monday.id, MON);
    await completeOn(user, wednesday.id, WED);

    expect(await streakOf(user)).toEqual({ current: 2, best: 2, lastFulfilledDate: WED });
  });

  it('dia perdido só gasta o coringa quando a janela dele fecha (23:59 do dia seguinte)', async () => {
    const { user, activity } = await setup();
    const monday = await onceBlock(user, activity.id, MON);
    await onceBlock(user, activity.id, TUE); // terça: nunca cumprida
    await completeOn(user, monday.id, MON);

    // quarta 12:00: ainda dá para concluir a terça (até 23:59 de quarta) -> coringa intacto
    clock.set(noon(WED));
    expect(await jokerOf(user)).toEqual({ weekStart: MON, used: false, usedOn: null });

    // quarta 23:59:59 ainda dentro da janela
    clock.set('2026-10-08T02:59:59.000Z');
    expect((await jokerOf(user)).used).toBe(false);

    // quinta 00:00 local: a janela da terça fechou -> o coringa perdoa, a sequência segue
    clock.set('2026-10-08T03:00:00.000Z');
    expect(await jokerOf(user)).toEqual({ weekStart: MON, used: true, usedOn: TUE });
    expect(await streakOf(user)).toEqual({ current: 1, best: 1, lastFulfilledDate: MON });
  });

  it('o segundo dia perdido da mesma semana quebra: o coringa é um só por semana', async () => {
    const { user, activity } = await setup();
    const mon = await onceBlock(user, activity.id, MON);
    await onceBlock(user, activity.id, TUE);
    await onceBlock(user, activity.id, WED);
    const thu = await onceBlock(user, activity.id, THU);
    await completeOn(user, mon.id, MON);
    await completeOn(user, thu.id, THU);

    // sexta: terça (perdoada) e quarta (quebra) já fecharam; quinta cumprida recomeça do 1
    clock.set(noon(FRI));
    expect(await streakOf(user)).toEqual({ current: 1, best: 1, lastFulfilledDate: THU });
    expect(await jokerOf(user)).toEqual({ weekStart: MON, used: true, usedOn: TUE });
  });

  it('dá para salvar o dia de ontem concluindo dentro da janela', async () => {
    const { user, activity } = await setup();
    const monday = await onceBlock(user, activity.id, MON);
    const tuesday = await onceBlock(user, activity.id, TUE);
    await completeOn(user, monday.id, MON);

    clock.set(noon(WED));
    expect((await complete(user, tuesday.id, TUE)).status).toBe(200);

    expect(await streakOf(user)).toEqual({ current: 2, best: 2, lastFulfilledDate: TUE });
  });

  it('desfazer uma conclusão cujo dia fecha sem cumprir gasta o coringa da semana', async () => {
    const { user, activity } = await setup();
    const [mon, tue, wed] = (await Promise.all(
      [MON, TUE, WED].map((date) => onceBlock(user, activity.id, date)),
    )) as [{ id: string }, { id: string }, { id: string }];
    await completeOn(user, mon.id, MON);
    await completeOn(user, tue.id, TUE);
    await completeOn(user, wed.id, WED);

    clock.set(noon(THU));
    expect(await streakOf(user)).toEqual({ current: 3, best: 3, lastFulfilledDate: WED });
    expect((await jokerOf(user)).used).toBe(false);

    // desfaz a terça ainda dentro da janela dela; na quinta ela fecha sem conclusão
    clock.set(noon(WED));
    expect((await undo(user, tue.id, TUE)).status).toBe(200);
    clock.set(noon(THU));
    expect(await streakOf(user)).toEqual({ current: 2, best: 2, lastFulfilledDate: WED });
    expect(await jokerOf(user)).toEqual({ weekStart: MON, used: true, usedOn: TUE });
  });

  it('na segunda-feira (semana que começa hoje), concluir hoje já conta', async () => {
    const { user, activity } = await setup();
    const block = await onceBlock(user, activity.id, MON);
    await completeOn(user, block.id, MON);
    expect(await streakOf(user)).toEqual({ current: 1, best: 1, lastFulfilledDate: MON });
  });

  it('uma série semanal cumprida por várias semanas seguidas soma uma por semana', async () => {
    const { user, activity } = await setup();
    const weekly = await request(server()).post('/api/blocks').set(bearer(user)).send({
      recurrence: 'weekly',
      activityId: activity.id,
      weekday: 1,
      startTime: '09:00',
      durationMin: 60,
      validFrom: '2026-09-14',
    });
    for (const monday of ['2026-09-14', '2026-09-21', '2026-09-28', MON]) {
      await completeOn(user, weekly.body.id, monday);
    }
    expect(await streakOf(user)).toEqual({ current: 4, best: 4, lastFulfilledDate: MON });
  });

  it('pular o bloco do dia torna o dia neutro (RN11): não quebra o streak', async () => {
    const { user, activity } = await setup();
    const monday = await onceBlock(user, activity.id, MON);
    const tuesday = await onceBlock(user, activity.id, TUE);
    const wednesday = await onceBlock(user, activity.id, WED);
    await completeOn(user, monday.id, MON);
    await completeOn(user, wednesday.id, WED);

    clock.set(noon(THU));
    // terça perdida e fechada gasta o coringa; a sequência de segunda a quarta segue
    expect((await streakOf(user)).current).toBe(2);
    expect((await jokerOf(user)).used).toBe(true);

    // pular a terça a torna neutra: o coringa volta a ficar disponível
    expect((await skip(user, tuesday.id, TUE)).status).toBe(200);
    expect(await streakOf(user)).toEqual({ current: 2, best: 2, lastFulfilledDate: WED });
    expect((await jokerOf(user)).used).toBe(false);
  });

  it('um bloco movido de dia conta no dia para onde foi', async () => {
    const { user, activity } = await setup();
    const monday = await onceBlock(user, activity.id, MON);
    const weekly = await request(server()).post('/api/blocks').set(bearer(user)).send({
      recurrence: 'weekly',
      activityId: activity.id,
      weekday: 1,
      startTime: '08:00',
      durationMin: 60,
      validFrom: MON,
    });
    // a série semanal de segunda é movida para quarta nesta semana
    await request(server())
      .put(`/api/blocks/${weekly.body.id}/exceptions/${MON}`)
      .set(bearer(user))
      .send({ type: 'override', newDate: WED });
    await completeOn(user, monday.id, MON);

    clock.set(noon(WED));
    expect((await complete(user, weekly.body.id, MON)).status).toBe(200);

    // segunda (bloco avulso) e quarta (bloco movido) cumpridas; terça neutra
    expect(await streakOf(user)).toEqual({ current: 2, best: 2, lastFulfilledDate: WED });
  });

  it('blocos de qualquer área contam (inclusive Descanso, RN15)', async () => {
    const { user, other } = await setup();
    const block = await onceBlock(user, other.id, WED);
    await completeOn(user, block.id, WED);
    expect((await streakOf(user)).current).toBe(1);
  });

  it('usa o dia local da pessoa (fuso) e não é afetado por outras contas', async () => {
    const { user: ana, activity } = await setup('Pacific/Kiritimati'); // UTC+14
    const { user: bia } = await setup();
    // 2026-10-07T15:00Z já é 05:00 do dia 08 em Kiritimati
    const block = await onceBlock(ana, activity.id, THU, '04:00');
    clock.set(noon(WED));
    expect((await complete(ana, block.id, THU)).status).toBe(200);

    expect(await streakOf(ana)).toEqual({ current: 1, best: 1, lastFulfilledDate: THU });
    expect(await streakOf(bia)).toEqual({ current: 0, best: 0, lastFulfilledDate: null });
  });

  it('séries semanais: cada semana planejada cumprida soma, e o passado continua valendo após editar a série', async () => {
    const { user, activity } = await setup();
    const weekly = await request(server()).post('/api/blocks').set(bearer(user)).send({
      recurrence: 'weekly',
      activityId: activity.id,
      weekday: 3,
      startTime: '09:00',
      durationMin: 60,
      validFrom: '2026-09-23',
    });
    const id = weekly.body.id as string;
    await completeOn(user, id, '2026-09-23');
    await completeOn(user, id, '2026-09-30');
    await completeOn(user, id, WED);
    expect((await streakOf(user)).current).toBe(3);

    // edita "esta e as próximas" a partir de 14/10: o passado não muda
    const edit = await request(server())
      .patch(`/api/blocks/${id}`)
      .set(bearer(user))
      .send({ from: '2026-10-14', startTime: '10:00' });
    expect(edit.status).toBe(200);
    expect(await streakOf(user)).toEqual({ current: 3, best: 3, lastFulfilledDate: WED });
  });

  it('o coringa é de cada pessoa: o de uma conta não é gasto pela outra', async () => {
    const { user: ana, activity } = await setup();
    const { user: bia } = await setup();
    const mon = await onceBlock(ana, activity.id, MON);
    await onceBlock(ana, activity.id, TUE);
    await completeOn(ana, mon.id, MON);

    clock.set(noon(THU));
    expect((await jokerOf(ana)).used).toBe(true);
    expect(await jokerOf(bia)).toEqual({ weekStart: MON, used: false, usedOn: null });
  });

  it('exige autenticação (o streak vem em /progress)', async () => {
    expect((await request(server()).get('/api/progress')).status).toBe(401);
  });
});
