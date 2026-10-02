import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  completionResultSchema,
  questSchema,
  undoResultSchema,
  xpHistoryPageSchema,
  type Quest,
} from '@lifexp/shared';
import { QUEST_LOCK_KEY, QuestsScheduler } from '../src/gamification/quests.scheduler.js';
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

const T0 = '2026-10-07T15:00:00.000Z'; // quarta 12:00 em São Paulo; semana atual = 2026-10-05
const WEEK = '2026-10-05';
const DAY = '2026-10-07';

describe('Quest semanal (e2e, RF22, RN16 a RN18)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let scheduler: QuestsScheduler;
  const clock = new FakeClock(T0);
  const server = () => app.getHttpServer();
  const usersToCheck: string[] = [];

  beforeAll(async () => {
    app = await createTestApp({ clock });
    prisma = app.get(PrismaService);
    scheduler = app.get(QuestsScheduler);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => clock.set(T0));
  afterEach(async () => {
    while (usersToCheck.length > 0) await expectCachesConsistent(prisma, usersToCheck.pop()!);
  });

  const send = (
    method: 'get' | 'post' | 'put' | 'delete' | 'patch',
    user: TestUser,
    path: string,
    body?: object,
  ) => {
    const req = request(server())[method](path).set(bearer(user));
    return body ? req.send(body) : req;
  };
  const setup = async () => {
    const user = await registerUser(app);
    usersToCheck.push(user.userId);
    const [activity] = await listActivities(app, user);
    return { user, activity: activity! };
  };
  const quest = async (user: TestUser, week = '') => {
    const res = await send('get', user, `/api/quest${week ? `?weekStart=${week}` : ''}`);
    expect(res.status).toBe(200);
    return questSchema.parse(res.body);
  };
  /** `count` blocos avulsos de 60 min (60 XP cada), todos hoje de manhã: já começaram e ainda estão na janela. */
  const makeBlocks = async (
    user: TestUser,
    activityId: string,
    count: number,
    durationMin = 60,
  ) => {
    const ids: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const hours = String(Math.floor(index / 2)).padStart(2, '0');
      const minutes = index % 2 === 0 ? '00' : '30';
      const res = await send('post', user, '/api/blocks', {
        recurrence: 'once',
        activityId,
        date: DAY,
        startTime: `${hours}:${minutes}`,
        durationMin,
      });
      expect(res.status).toBe(201);
      ids.push(res.body.id);
    }
    return ids;
  };
  const complete = (user: TestUser, blockId: string) =>
    send('post', user, `/api/blocks/${blockId}/occurrences/${DAY}/completion`);
  const undo = (user: TestUser, blockId: string) =>
    send('delete', user, `/api/blocks/${blockId}/occurrences/${DAY}/completion`);
  const skip = (user: TestUser, blockId: string) =>
    send('put', user, `/api/blocks/${blockId}/exceptions/${DAY}`, { type: 'skip' });
  const unskip = (user: TestUser, blockId: string) =>
    send('delete', user, `/api/blocks/${blockId}/exceptions/${DAY}`);
  const done = async (user: TestUser, ids: string[]) => {
    const results = [];
    for (const id of ids) {
      const res = await complete(user, id);
      expect(res.status).toBe(200);
      results.push(completionResultSchema.parse(res.body));
    }
    return results;
  };
  const questRows = (user: TestUser) =>
    prisma.xpTransaction.findMany({
      where: { userId: user.userId, type: 'QUEST' },
      orderBy: { createdAt: 'asc' },
    });
  const reversals = async (user: TestUser) =>
    prisma.xpTransaction.findMany({
      where: { userId: user.userId, type: 'REVERSAL', reversed: { type: 'QUEST' } },
    });
  const totalXp = async (user: TestUser) =>
    (await prisma.user.findUniqueOrThrow({ where: { id: user.userId } })).cachedTotalXp;

  describe('GET /quest', () => {
    it('exige autenticação', async () => {
      expect((await request(server()).get('/api/quest')).status).toBe(401);
    });

    it('semana sem nenhum bloco planejado: sem quest (none), sem nada gravado', async () => {
      const { user } = await setup();
      expect(await quest(user)).toEqual({
        weekStart: WEEK,
        status: 'none',
        eligible: 0,
        completed: 0,
        target: 0,
        ratio: null,
        bonusXp: 0,
        tiers: [],
        completedAt: null,
      });
      expect(await prisma.weeklyQuest.count({ where: { userId: user.userId } })).toBe(0);
    });

    it('a primeira consulta da semana tira o snapshot: alvo de 80%, faixas e bônus de 20%', async () => {
      const { user, activity } = await setup();
      await makeBlocks(user, activity.id, 10);

      const result = await quest(user);

      expect(result).toMatchObject({
        weekStart: WEEK,
        status: 'active',
        eligible: 10,
        completed: 0,
        target: 8,
        ratio: 0,
        bonusXp: 120, // 20% de 10 × 60 XP
        completedAt: null,
      });
      expect(result.tiers).toEqual([
        { percent: 80, requiredCount: 8, reached: false },
        { percent: 90, requiredCount: 9, reached: false },
        { percent: 100, requiredCount: 10, reached: false },
      ]);
      const rows = await prisma.weeklyQuest.findMany({
        where: { userId: user.userId },
        include: { items: true },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.createdAt.toISOString()).toBe(T0);
      expect(rows[0]!.items).toHaveLength(10);
      expect(rows[0]!.items.every((item) => item.xp === 60 && item.durationMin === 60)).toBe(true);
    });

    it('o XP previsto usa o peso da atividade', async () => {
      const { user, activity } = await setup();
      await send('patch', user, `/api/activities/${activity.id}`, { xpWeight: 2 });
      await makeBlocks(user, activity.id, 5);
      const result = await quest(user);
      expect(result.bonusXp).toBe(120); // 5 × (60 × 2) × 20%
    });

    it('é idempotente: consultar de novo não cria outro snapshot', async () => {
      const { user, activity } = await setup();
      await makeBlocks(user, activity.id, 4);
      await quest(user);
      await quest(user);
      await Promise.all([quest(user), quest(user), quest(user)]);
      expect(await prisma.weeklyQuest.count({ where: { userId: user.userId } })).toBe(1);
      expect(await prisma.questItem.count({ where: { quest: { userId: user.userId } } })).toBe(4);
    });

    it('várias primeiras consultas AO MESMO TEMPO criam um snapshot só, e todas respondem 200', async () => {
      const { user, activity } = await setup();
      await makeBlocks(user, activity.id, 4);

      const results = await Promise.all(
        Array.from({ length: 6 }, () => send('get', user, '/api/quest')),
      );

      expect(results.map((res) => res.status)).toEqual([200, 200, 200, 200, 200, 200]);
      for (const res of results)
        expect(questSchema.parse(res.body)).toMatchObject({ eligible: 4, status: 'active' });
      expect(await prisma.weeklyQuest.count({ where: { userId: user.userId } })).toBe(1);
    });

    it('bloco criado DEPOIS do snapshot nunca entra, nem reduz nem aumenta a meta (RN18)', async () => {
      const { user, activity } = await setup();
      const ids = await makeBlocks(user, activity.id, 5);
      expect(await quest(user)).toMatchObject({ eligible: 5, target: 4 });

      // cinco blocos novos, às 03:00 em diante (já começaram), cumpridos
      const later: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        const res = await send('post', user, '/api/blocks', {
          recurrence: 'once',
          activityId: activity.id,
          date: DAY,
          startTime: `0${3 + Math.floor(i / 2)}:${i % 2 === 0 ? '00' : '30'}`,
          durationMin: 15,
        });
        later.push(res.body.id);
      }
      await done(user, later);

      const after = await quest(user);
      expect(after).toMatchObject({ eligible: 5, completed: 0, target: 4, status: 'active' });
      expect(await questRows(user)).toHaveLength(0); // concluir só os novos nunca cumpre a quest
      await done(user, ids.slice(0, 4));
      expect(await quest(user)).toMatchObject({ completed: 4, status: 'completed' });
    });

    it('ocorrência já pulada quando o snapshot é tirado não entra', async () => {
      const { user, activity } = await setup();
      const ids = await makeBlocks(user, activity.id, 4);
      await skip(user, ids[0]!);
      expect(await quest(user)).toMatchObject({ eligible: 3, target: 3 });
      expect(await prisma.questItem.count({ where: { quest: { userId: user.userId } } })).toBe(3);
    });

    it('semana passada sem quest e semana futura são "none" (nada é criado para o passado)', async () => {
      const { user, activity } = await setup();
      await makeBlocks(user, activity.id, 3);
      expect((await quest(user, '2026-09-28')).status).toBe('none');
      expect((await quest(user, '2026-10-12')).status).toBe('none');
      expect((await quest(user, '2030-01-07')).status).toBe('none');
      expect(await prisma.weeklyQuest.count({ where: { userId: user.userId } })).toBe(0);
    });

    it('semana passada que TEM blocos planejados também não ganha quest depois do fato', async () => {
      const { user, activity } = await setup();
      await send('post', user, '/api/blocks', {
        recurrence: 'weekly',
        activityId: activity.id,
        weekday: 3,
        startTime: '09:00',
        durationMin: 60,
        validFrom: '2026-09-01',
      });

      expect((await quest(user, '2026-09-28')).status).toBe('none'); // havia plano, mas o snapshot não foi tirado
      expect(await prisma.weeklyQuest.count({ where: { userId: user.userId } })).toBe(0);
      expect((await quest(user)).status).toBe('active'); // a semana atual, sim
    });

    it('rejeita semana que não é segunda-feira ou inválida (400), sem lançar 500', async () => {
      const { user } = await setup();
      for (const week of ['2026-10-06', '2026-02-30', 'hoje', '']) {
        const res = await send('get', user, `/api/quest?weekStart=${week}`);
        expect([week, res.status]).toEqual([week, 400]);
      }
    });

    it('cada pessoa tem a própria quest, e os blocos de uma não aparecem na da outra (RS06)', async () => {
      const [a, b] = [await setup(), await setup()];
      await makeBlocks(a.user, a.activity.id, 5);
      expect(await quest(b.user)).toMatchObject({ status: 'none', eligible: 0 });
      expect(await quest(a.user)).toMatchObject({ status: 'active', eligible: 5 });
    });
  });

  describe('cumprir a quest (RN17)', () => {
    it('ao cumprir 80% o bônus de 20% entra, na mesma transação da conclusão, só no total', async () => {
      const { user, activity } = await setup();
      const ids = await makeBlocks(user, activity.id, 10);
      await quest(user);

      const results = await done(user, ids.slice(0, 8));

      // os 7 primeiros não destravam nada; o 8º destrava
      expect(results.slice(0, 7).map((r) => r.questBonusXp)).toEqual([0, 0, 0, 0, 0, 0, 0]);
      const eighth = results[7]!;
      expect(eighth.questBonusXp).toBe(120);
      // 8 × 60 = 480 (nível 3); com o bônus, 600 (nível 4): o resultado já conta o bônus
      expect(eighth.levelBefore).toBe(3);
      expect(eighth.levelAfter).toBe(4);
      expect(eighth.total.xp).toBe(600);
      expect(eighth.xpAwarded).toBe(60);

      const [row] = await questRows(user);
      const stored = await prisma.weeklyQuest.findFirstOrThrow({ where: { userId: user.userId } });
      expect(row).toMatchObject({
        amount: 120,
        areaId: null,
        sourceId: stored.id,
        reversedTransactionId: null,
      });
      expect(row!.createdAt.toISOString()).toBe(T0);
      expect(stored).toMatchObject({ status: 'COMPLETED' });
      expect(stored.completedAt?.toISOString()).toBe(T0);
      expect(await totalXp(user)).toBe(600);
      // o bônus não pertence a nenhuma área: o XP da área é só o das conclusões
      const area = await prisma.areaProgress.findFirstOrThrow({ where: { userId: user.userId } });
      expect(area.cachedXp).toBe(480);

      expect(await quest(user)).toMatchObject({
        status: 'completed',
        completed: 8,
        eligible: 10,
        bonusXp: 120,
        completedAt: T0,
      });
    });

    it('cumprir o resto não dá outro bônus, e as faixas de 90% e 100% só acendem', async () => {
      const { user, activity } = await setup();
      const ids = await makeBlocks(user, activity.id, 10);
      await quest(user);
      const results = await done(user, ids);

      expect(results.map((r) => r.questBonusXp)).toEqual([0, 0, 0, 0, 0, 0, 0, 120, 0, 0]);
      expect(await questRows(user)).toHaveLength(1);
      expect(await totalXp(user)).toBe(720);
      const final = await quest(user);
      expect(final.tiers.map((t) => t.reached)).toEqual([true, true, true]);
      expect(final).toMatchObject({ status: 'completed', completed: 10, ratio: 1 });
    });

    it('as faixas acendem uma a uma, sem XP extra (RN34)', async () => {
      const { user, activity } = await setup();
      const ids = await makeBlocks(user, activity.id, 10);
      await quest(user);

      await done(user, ids.slice(0, 8));
      expect((await quest(user)).tiers.map((t) => t.reached)).toEqual([true, false, false]);
      const xpAt80 = await totalXp(user);
      await done(user, ids.slice(8, 9));
      expect((await quest(user)).tiers.map((t) => t.reached)).toEqual([true, true, false]);
      expect(await totalXp(user)).toBe(xpAt80 + 60); // só o XP do bloco, nada de bônus de faixa
    });

    it('concluir a mesma ocorrência de novo é idempotente (nenhum bônus a mais)', async () => {
      const { user, activity } = await setup();
      const ids = await makeBlocks(user, activity.id, 5);
      await quest(user);
      await done(user, ids.slice(0, 4));
      const again = await complete(user, ids[3]!);
      expect(again.body).toMatchObject({ alreadyCompleted: true, questBonusXp: 0 });
      expect(await questRows(user)).toHaveLength(1);
    });

    it('duas conclusões simultâneas que cruzam os 80% dão UM bônus só', async () => {
      const { user, activity } = await setup();
      const ids = await makeBlocks(user, activity.id, 10);
      await quest(user);
      await done(user, ids.slice(0, 7));

      const [eighth, ninth] = await Promise.all([complete(user, ids[7]!), complete(user, ids[8]!)]);

      expect([eighth.status, ninth.status]).toEqual([200, 200]);
      const bonuses = [eighth.body.questBonusXp, ninth.body.questBonusXp].sort((x, y) => x - y);
      expect(bonuses).toEqual([0, 120]);
      expect(await questRows(user)).toHaveLength(1);
      expect(await totalXp(user)).toBe(9 * 60 + 120);
    });

    it('o bônus entra no XP do dia da tela Hoje e no histórico de XP', async () => {
      const { user, activity } = await setup();
      const ids = await makeBlocks(user, activity.id, 5);
      await quest(user);
      await done(user, ids.slice(0, 4));

      const today = await send('get', user, '/api/today');
      expect(today.body.xpToday).toBe(4 * 60 + 60); // 5 × 60 × 20% = 60

      const history = xpHistoryPageSchema.parse((await send('get', user, '/api/xp/history')).body);
      const entry = history.items.find((item) => item.type === 'quest');
      expect(entry).toMatchObject({
        amount: 60,
        areaId: null,
        areaName: null,
        sourceLabel: 'Quest da semana de 05/10',
      });
    });

    it('um bloco só: cumprir o único cumpre a quest (arredonda para cima)', async () => {
      const { user, activity } = await setup();
      const [id] = await makeBlocks(user, activity.id, 1);
      await quest(user);
      const res = await complete(user, id!);
      expect(res.body.questBonusXp).toBe(12); // 20% de 60
    });
  });

  describe('desfazer', () => {
    it('cair abaixo dos 80% estorna o bônus (sem punição extra) e a quest volta a ativa', async () => {
      const { user, activity } = await setup();
      const ids = await makeBlocks(user, activity.id, 10);
      await quest(user);
      await done(user, ids.slice(0, 8));
      expect(await totalXp(user)).toBe(600);

      const res = await undo(user, ids[7]!);

      expect(res.status).toBe(200);
      const parsed = undoResultSchema.parse(res.body);
      expect(parsed).toMatchObject({ xpReverted: 60, questBonusReverted: 120 });
      expect(parsed.total.xp).toBe(420); // 7 × 60: o saldo volta ao que era antes de cumprir
      expect(await totalXp(user)).toBe(420);

      const [row] = await questRows(user);
      const [reversal] = await reversals(user);
      expect(reversal).toMatchObject({
        amount: -120,
        reversedTransactionId: row!.id,
        areaId: null,
      });
      expect(await quest(user)).toMatchObject({
        status: 'active',
        completed: 7,
        completedAt: null,
        bonusXp: 120,
      });
      const stored = await prisma.weeklyQuest.findFirstOrThrow({ where: { userId: user.userId } });
      expect(stored).toMatchObject({ status: 'ACTIVE', completedAt: null });
    });

    it('desfazer sem cair abaixo dos 80% mantém o bônus', async () => {
      const { user, activity } = await setup();
      const ids = await makeBlocks(user, activity.id, 10);
      await quest(user);
      await done(user, ids.slice(0, 9));

      const res = await undo(user, ids[8]!); // 9 → 8: ainda cumpre

      expect(res.body.questBonusReverted).toBe(0);
      expect(await reversals(user)).toHaveLength(0);
      expect((await quest(user)).status).toBe('completed');
    });

    it('cumprir de novo depois de desfazer dá o bônus outra vez (o saldo fecha, sem inflar)', async () => {
      const { user, activity } = await setup();
      const ids = await makeBlocks(user, activity.id, 10);
      await quest(user);
      await done(user, ids.slice(0, 8));
      await undo(user, ids[7]!);

      const again = await complete(user, ids[7]!);

      expect(again.body.questBonusXp).toBe(120);
      expect(await totalXp(user)).toBe(600);
      expect(await questRows(user)).toHaveLength(2);
      expect(await reversals(user)).toHaveLength(1);
    });

    it('desfazer algo que não estava concluído não mexe na quest', async () => {
      const { user, activity } = await setup();
      const ids = await makeBlocks(user, activity.id, 5);
      await quest(user);
      const res = await undo(user, ids[0]!);
      expect(res.body).toMatchObject({ xpReverted: 0, questBonusReverted: 0 });
    });
  });

  describe('pular e restaurar (não pune)', () => {
    it('pular blocos que faltavam tira da conta e pode CUMPRIR a quest; a consulta liquida o bônus', async () => {
      const { user, activity } = await setup();
      const ids = await makeBlocks(user, activity.id, 10);
      await quest(user);
      await done(user, ids.slice(0, 7));
      expect(await questRows(user)).toHaveLength(0);

      await skip(user, ids[9]!); // 9 elegíveis: alvo 8, cumpridos 7
      expect(await quest(user)).toMatchObject({ eligible: 9, target: 8, status: 'active' });
      await skip(user, ids[8]!); // 8 elegíveis: alvo 7, cumpridos 7 → cumpre

      const after = await quest(user);

      expect(after).toMatchObject({ eligible: 8, target: 7, completed: 7, status: 'completed' });
      expect(after.bonusXp).toBe(96); // 20% de 8 × 60, congelado no lançamento
      const [row] = await questRows(user);
      expect(row!.amount).toBe(96);
      expect(await totalXp(user)).toBe(7 * 60 + 96);
    });

    it('o bônus dado fica CONGELADO: mudar o plano depois de cumprir não o muda', async () => {
      const { user, activity } = await setup();
      const ids = await makeBlocks(user, activity.id, 10);
      await quest(user);
      await done(user, ids.slice(0, 8)); // cumpriu: bônus de 20% de 10 × 60 = 120

      await skip(user, ids[9]!); // 9 elegíveis: o bônus de AGORA seria 108, mas o dado foi 120

      const after = await quest(user);
      expect(after).toMatchObject({ status: 'completed', eligible: 9 });
      expect(after.bonusXp).toBe(120);
      expect((await questRows(user)).map((row) => row.amount)).toEqual([120]);
    });

    it('restaurar um bloco pulado devolve a conta e a consulta estorna o bônus se ele deixa de valer', async () => {
      const { user, activity } = await setup();
      const ids = await makeBlocks(user, activity.id, 10);
      await quest(user);
      await done(user, ids.slice(0, 7));
      await skip(user, ids[9]!);
      await skip(user, ids[8]!);
      expect((await quest(user)).status).toBe('completed');

      await unskip(user, ids[8]!); // volta: 9 elegíveis, alvo 8, cumpridos 7

      const after = await quest(user);
      expect(after).toMatchObject({ eligible: 9, target: 8, status: 'active' });
      expect(await reversals(user)).toHaveLength(1);
      expect(await totalXp(user)).toBe(7 * 60);
    });

    it('uma semana toda pulada deixa a quest sem blocos elegíveis: nunca cumpre de graça', async () => {
      const { user, activity } = await setup();
      const ids = await makeBlocks(user, activity.id, 3);
      await quest(user);
      for (const id of ids) await skip(user, id);

      const result = await quest(user);

      expect(result).toMatchObject({
        eligible: 0,
        target: 0,
        completed: 0,
        ratio: null,
        bonusXp: 0,
        status: 'active',
      });
      expect(await questRows(user)).toHaveLength(0);
    });
  });

  describe('agendador (RN16)', () => {
    const weeklyBlock = (user: TestUser, activityId: string) =>
      send('post', user, '/api/blocks', {
        recurrence: 'weekly',
        activityId,
        weekday: 3,
        startTime: '09:00',
        durationMin: 60,
        validFrom: '2026-09-01',
      });

    it('cria a quest de quem tem blocos, uma vez, e só dessas pessoas', async () => {
      const [withBlocks, without] = [await setup(), await setup()];
      await weeklyBlock(withBlocks.user, withBlocks.activity.id);

      const first = await scheduler.runOnce(new Date(T0));

      expect(first!.created).toBeGreaterThanOrEqual(1);
      const rows = await prisma.weeklyQuest.findMany({ where: { userId: withBlocks.user.userId } });
      expect(rows.map((r) => r.weekStart.toISOString().slice(0, 10))).toEqual([WEEK]);
      expect(await prisma.weeklyQuest.count({ where: { userId: without.user.userId } })).toBe(0);

      await scheduler.runOnce(new Date(T0));
      expect(await prisma.weeklyQuest.count({ where: { userId: withBlocks.user.userId } })).toBe(1);
    });

    it('tira o snapshot no começo: o que for planejado depois não entra (RN18)', async () => {
      const { user, activity } = await setup();
      await weeklyBlock(user, activity.id);
      await scheduler.runOnce(new Date(T0));
      await makeBlocks(user, activity.id, 3);

      const result = await quest(user);

      expect(result).toMatchObject({ eligible: 1, target: 1, status: 'active' });
    });

    it('usa a semana do fuso de cada pessoa na virada', async () => {
      const [kiritimati, losAngeles] = [await setup(), await setup()];
      for (const [who, timezone] of [
        [kiritimati, 'Pacific/Kiritimati'],
        [losAngeles, 'America/Los_Angeles'],
      ] as const) {
        await send('patch', who.user, '/api/users/me', { timezone });
        await weeklyBlock(who.user, who.activity.id);
      }

      // domingo 11/10 12:00Z: já é segunda 12/10 (02:00) em Kiritimati; em Los Angeles ainda é domingo 05:00
      await scheduler.runOnce(new Date('2026-10-11T12:00:00.000Z'));

      const week = async (who: { user: TestUser }) =>
        (
          await prisma.weeklyQuest.findFirstOrThrow({ where: { userId: who.user.userId } })
        ).weekStart
          .toISOString()
          .slice(0, 10);
      expect(await week(kiritimati)).toBe('2026-10-12');
      expect(await week(losAngeles)).toBe('2026-10-05');
    });

    it('rodar em paralelo (duas instâncias) cria uma quest só', async () => {
      const { user, activity } = await setup();
      await weeklyBlock(user, activity.id);
      await Promise.all([
        scheduler.runOnce(new Date(T0)),
        scheduler.runOnce(new Date(T0)),
        scheduler.runOnce(new Date(T0)),
      ]);
      expect(await prisma.weeklyQuest.count({ where: { userId: user.userId } })).toBe(1);
    });

    it('com a trava ocupada por outra instância, pula sem criar nada', async () => {
      const { user, activity } = await setup();
      await weeklyBlock(user, activity.id);

      const result = await prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${QUEST_LOCK_KEY})`;
          return scheduler.runOnce(new Date(T0));
        },
        { timeout: 110_000, maxWait: 10_000 },
      );

      expect(result).toBeNull();
      expect(await prisma.weeklyQuest.count({ where: { userId: user.userId } })).toBe(0);
    }, 120_000);

    it('com o agendador desligado (testes), o tick não faz nada', async () => {
      const { user, activity } = await setup();
      await weeklyBlock(user, activity.id);
      await scheduler.tick();
      expect(await prisma.weeklyQuest.count({ where: { userId: user.userId } })).toBe(0);
    });
  });

  it('o número de consultas da quest não cresce com a quantidade de blocos', async () => {
    const { user, activity } = await setup();
    const queries: string[] = [];
    let counting = false;
    (prisma as unknown as { $on(e: 'query', cb: (q: { query: string }) => void): void }).$on(
      'query',
      (event) => {
        const control = /^(BEGIN|COMMIT|SET|SHOW|DEALLOCATE)/i.test(event.query);
        if (counting && !control && !event.query.includes('"Session"')) queries.push(event.query);
      },
    );
    const countFor = async (): Promise<[Quest, number]> => {
      queries.length = 0;
      counting = true;
      const result = await quest(user);
      counting = false;
      return [result, queries.length];
    };
    await makeBlocks(user, activity.id, 2);
    await quest(user); // tira o snapshot (essa consulta escreve)
    const [, withTwo] = await countFor();
    const rest = await makeBlocks(user, activity.id, 4, 15);
    await done(user, rest);
    const [, withMany] = await countFor();
    expect(withMany).toBe(withTwo);
  });
});
