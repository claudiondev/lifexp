import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  goalActionResultSchema,
  goalSchema,
  progressSchema,
  todayResponseSchema,
} from '@lifexp/shared';
import { CacheRebuildService } from '../src/gamification/cache-rebuild.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  FakeClock,
  bearer,
  createTestApp,
  expectCachesConsistent,
  registerUser,
  type TestUser,
} from './helpers.js';

const NOON = '2026-10-07T15:00:00.000Z'; // quarta 12:00 em São Paulo

describe('XP de marcos e metas (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const clock = new FakeClock(NOON);
  const server = () => app.getHttpServer();
  const usersToCheck: string[] = [];

  beforeAll(async () => {
    app = await createTestApp({ clock });
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => clock.set(NOON));
  afterEach(async () => {
    while (usersToCheck.length > 0) await expectCachesConsistent(prisma, usersToCheck.pop()!);
  });

  const setup = async () => {
    const user = await registerUser(app);
    usersToCheck.push(user.userId);
    const areaId = (await prisma.area.findFirstOrThrow({ where: { userId: user.userId } })).id;
    return { user, areaId };
  };

  const call = (
    method: 'post' | 'put' | 'delete' | 'get' | 'patch',
    user: TestUser,
    path: string,
    body?: object,
  ) => {
    const req = request(server())[method](path).set(bearer(user));
    return body ? req.send(body) : req;
  };

  const newGoal = async (user: TestUser, body: object = {}) => {
    const res = await call('post', user, '/api/goals', { title: 'Meta', ...body });
    expect(res.status).toBe(201);
    return goalSchema.parse(res.body);
  };
  const newMilestone = async (user: TestUser, goalId: string, title = 'Marco') => {
    const res = await call('post', user, `/api/goals/${goalId}/milestones`, { title });
    expect(res.status).toBe(201);
    return goalSchema.parse(res.body).milestones.at(-1)!.id;
  };
  const completeMs = (user: TestUser, goalId: string, ms: string) =>
    call('post', user, `/api/goals/${goalId}/milestones/${ms}/completion`);
  const undoMs = (user: TestUser, goalId: string, ms: string) =>
    call('delete', user, `/api/goals/${goalId}/milestones/${ms}/completion`);
  const setStatus = (user: TestUser, goalId: string, status: string) =>
    call('put', user, `/api/goals/${goalId}/status`, { status });
  const action = (res: request.Response) => {
    expect(res.status).toBe(200);
    return goalActionResultSchema.parse(res.body);
  };
  const ledger = (userId: string) =>
    prisma.xpTransaction.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  const progress = async (user: TestUser) =>
    progressSchema.parse((await call('get', user, '/api/progress')).body);

  describe('concluir marco (RN21: +100 XP)', () => {
    it('concede 100 XP ao total e à área da meta, com lançamento no livro-caixa', async () => {
      const { user, areaId } = await setup();
      const goal = await newGoal(user, { areaId });
      const ms = await newMilestone(user, goal.id);
      await newMilestone(user, goal.id, 'Outro');

      const result = action(await completeMs(user, goal.id, ms));

      expect(result.xpDelta).toBe(100);
      expect(result.total.xp).toBe(100);
      expect(result.goal.milestones[0]).toMatchObject({ done: true });
      expect(result.goal.milestones[0]!.doneAt).toBe(NOON);
      expect(result.goal.progress).toEqual({ ratio: 0.5, source: 'milestones' });

      const entries = await ledger(user.userId);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        type: 'MILESTONE',
        amount: 100,
        areaId,
        sourceId: ms,
      });
      expect(entries[0]!.createdAt.toISOString()).toBe(NOON);

      const p = await progress(user);
      expect(p.total.xp).toBe(100);
      expect(p.areas.find((a) => a.areaId === areaId)?.xp).toBe(100);
    });

    it('sobe de nível quando o XP cruza o limite e informa antes e depois', async () => {
      const { user } = await setup();
      const goal = await newGoal(user);
      const ms = await newMilestone(user, goal.id);

      const result = action(await completeMs(user, goal.id, ms));

      expect(result.levelBefore).toBe(1);
      expect(result.levelAfter).toBe(2); // 100 XP é o nível 2
    });

    it('meta sem área rende XP só ao total, sem mexer em nenhuma área', async () => {
      const { user } = await setup();
      const goal = await newGoal(user);
      const ms = await newMilestone(user, goal.id);

      await completeMs(user, goal.id, ms);

      const p = await progress(user);
      expect(p.total.xp).toBe(100);
      expect(p.areas.every((area) => area.xp === 0)).toBe(true);
      expect((await ledger(user.userId))[0]!.areaId).toBeNull();
    });

    it('é idempotente: concluir de novo não dá XP nem cria lançamento', async () => {
      const { user } = await setup();
      const goal = await newGoal(user);
      const ms = await newMilestone(user, goal.id);
      await completeMs(user, goal.id, ms);

      const again = action(await completeMs(user, goal.id, ms));

      expect(again.xpDelta).toBe(0);
      expect(again.levelBefore).toBe(again.levelAfter);
      expect(again.total.xp).toBe(100);
      expect(await ledger(user.userId)).toHaveLength(1);
    });

    it('duas conclusões simultâneas do mesmo marco rendem 100 XP, não 200', async () => {
      const { user } = await setup();
      const goal = await newGoal(user);
      const ms = await newMilestone(user, goal.id);

      const results = await Promise.all([
        completeMs(user, goal.id, ms),
        completeMs(user, goal.id, ms),
        completeMs(user, goal.id, ms),
      ]);

      expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
      expect(results.filter((r) => r.body.xpDelta === 100)).toHaveLength(1);
      expect((await progress(user)).total.xp).toBe(100);
    });

    it('marcos diferentes em paralelo somam sem perder XP', async () => {
      const { user } = await setup();
      const goal = await newGoal(user);
      const ids = [
        await newMilestone(user, goal.id, 'A'),
        await newMilestone(user, goal.id, 'B'),
        await newMilestone(user, goal.id, 'C'),
      ];

      await Promise.all(ids.map((ms) => completeMs(user, goal.id, ms)));

      expect((await progress(user)).total.xp).toBe(300);
    });

    it('não conclui marco de meta concluída ou abandonada (409), mas vale em meta pausada', async () => {
      const { user } = await setup();
      const goal = await newGoal(user);
      const ms = await newMilestone(user, goal.id);

      await setStatus(user, goal.id, 'paused');
      expect((await completeMs(user, goal.id, ms)).status).toBe(200);
      await undoMs(user, goal.id, ms);

      await setStatus(user, goal.id, 'abandoned');
      const blocked = await completeMs(user, goal.id, ms);
      expect(blocked.status).toBe(409);
      expect(blocked.body.message).toMatch(/Reabra a meta/);

      await setStatus(user, goal.id, 'completed');
      expect((await completeMs(user, goal.id, ms)).status).toBe(409);
    });

    it('marco ou meta de outra pessoa responde 404 e não gera XP', async () => {
      const [ana, bia] = [await setup(), await setup()];
      const goal = await newGoal(ana.user);
      const ms = await newMilestone(ana.user, goal.id);

      expect((await completeMs(bia.user, goal.id, ms)).status).toBe(404);
      expect((await undoMs(bia.user, goal.id, ms)).status).toBe(404);
      expect(await ledger(bia.user.userId)).toHaveLength(0);
      expect(await ledger(ana.user.userId)).toHaveLength(0);
    });

    it('o XP do marco entra no "XP do dia" da tela Hoje', async () => {
      const { user } = await setup();
      const goal = await newGoal(user);
      await completeMs(user, goal.id, await newMilestone(user, goal.id));

      const today = todayResponseSchema.parse((await call('get', user, '/api/today')).body);
      expect(today.xpToday).toBe(100);
    });
  });

  describe('desfazer marco', () => {
    it('estorna os 100 XP com um lançamento negativo ligado ao original', async () => {
      const { user, areaId } = await setup();
      const goal = await newGoal(user, { areaId });
      const ms = await newMilestone(user, goal.id);
      await completeMs(user, goal.id, ms);

      const result = action(await undoMs(user, goal.id, ms));

      expect(result.xpDelta).toBe(-100);
      expect(result.total.xp).toBe(0);
      expect(result.goal.milestones[0]).toMatchObject({ done: false, doneAt: null });
      const entries = await ledger(user.userId);
      expect(entries.map((e) => [e.type, e.amount])).toEqual([
        ['MILESTONE', 100],
        ['REVERSAL', -100],
      ]);
      expect(entries[1]!.reversedTransactionId).toBe(entries[0]!.id);
      expect((await progress(user)).areas.find((a) => a.areaId === areaId)?.xp).toBe(0);
    });

    it('é idempotente: desfazer o que não está concluído não faz nada', async () => {
      const { user } = await setup();
      const goal = await newGoal(user);
      const ms = await newMilestone(user, goal.id);

      const result = action(await undoMs(user, goal.id, ms));

      expect(result.xpDelta).toBe(0);
      expect(await ledger(user.userId)).toHaveLength(0);
    });

    it('desfazer um marco que nunca foi concluído é inofensivo, até em meta concluída', async () => {
      const { user } = await setup();
      const goal = await newGoal(user);
      const ms = await newMilestone(user, goal.id);
      await setStatus(user, goal.id, 'completed');

      const result = action(await undoMs(user, goal.id, ms));

      expect(result.xpDelta).toBe(0);
    });

    it('concluir de novo depois de desfazer rende de novo (sem inflar: o saldo fecha)', async () => {
      const { user } = await setup();
      const goal = await newGoal(user);
      const ms = await newMilestone(user, goal.id);

      await completeMs(user, goal.id, ms);
      await undoMs(user, goal.id, ms);
      const again = action(await completeMs(user, goal.id, ms));

      expect(again.xpDelta).toBe(100);
      expect(again.total.xp).toBe(100);
      expect(await ledger(user.userId)).toHaveLength(3);
    });

    it('não desfaz marco de meta já concluída (409): reabra a meta primeiro', async () => {
      const { user } = await setup();
      const goal = await newGoal(user);
      const ms = await newMilestone(user, goal.id);
      await completeMs(user, goal.id, ms);
      await setStatus(user, goal.id, 'completed');

      expect((await undoMs(user, goal.id, ms)).status).toBe(409);
      expect((await progress(user)).total.xp).toBe(600);
    });
  });

  describe('status da meta (RF31) e XP da meta (RN21: +500)', () => {
    it('concluir a meta concede 500 XP, registra a data e o lançamento', async () => {
      const { user, areaId } = await setup();
      const goal = await newGoal(user, { areaId });

      const result = action(await setStatus(user, goal.id, 'completed'));

      expect(result.xpDelta).toBe(500);
      expect(result.goal).toMatchObject({ status: 'completed', completedAt: NOON, overdue: false });
      expect(result.total.xp).toBe(500);
      const [entry] = await ledger(user.userId);
      expect(entry).toMatchObject({ type: 'GOAL', amount: 500, areaId, sourceId: goal.id });
      expect((await progress(user)).areas.find((a) => a.areaId === areaId)?.xp).toBe(500);
    });

    it('a meta nunca conclui sozinha: completar todos os marcos só a deixa pronta', async () => {
      const { user } = await setup();
      const goal = await newGoal(user);
      const a = await newMilestone(user, goal.id, 'A');
      const b = await newMilestone(user, goal.id, 'B');
      await completeMs(user, goal.id, a);
      const last = action(await completeMs(user, goal.id, b));

      expect(last.goal.status).toBe('active');
      expect(last.goal.readyToComplete).toBe(true);
      expect(last.total.xp).toBe(200);
    });

    it('com métrica no alvo a meta também só fica pronta, sem XP', async () => {
      const { user } = await setup();
      const goal = await newGoal(user, { targetValue: 10 });
      const res = await call('patch', user, `/api/goals/${goal.id}`, { currentValue: 10 });

      expect(res.body).toMatchObject({ status: 'active', readyToComplete: true });
      expect((await progress(user)).total.xp).toBe(0);
    });

    it('meta sem métrica e sem marcos pode ser concluída manualmente, e nunca sozinha (RN20)', async () => {
      const { user } = await setup();
      const goal = await newGoal(user);
      expect(goal).toMatchObject({ status: 'active', readyToComplete: false });

      expect(action(await setStatus(user, goal.id, 'completed')).goal.status).toBe('completed');
    });

    it('concluir de novo não duplica o XP e não muda a data de conclusão', async () => {
      const { user } = await setup();
      const goal = await newGoal(user);
      await setStatus(user, goal.id, 'completed');
      clock.set('2026-10-08T15:00:00.000Z');

      const again = action(await setStatus(user, goal.id, 'completed'));

      expect(again.xpDelta).toBe(0);
      expect(again.goal.completedAt).toBe(NOON);
      expect(await ledger(user.userId)).toHaveLength(1);
    });

    it.each(['active', 'paused', 'abandoned'])(
      'sair de concluída para %s estorna os 500 XP e limpa a data',
      async (to) => {
        const { user } = await setup();
        const goal = await newGoal(user);
        await setStatus(user, goal.id, 'completed');

        const result = action(await setStatus(user, goal.id, to));

        expect(result.xpDelta).toBe(-500);
        expect(result.total.xp).toBe(0);
        expect(result.goal).toMatchObject({ status: to, completedAt: null });
        const entries = await ledger(user.userId);
        expect(entries.map((e) => e.amount)).toEqual([500, -500]);
      },
    );

    it('reabrir uma meta concluída não mexe no XP dos marcos', async () => {
      const { user } = await setup();
      const goal = await newGoal(user);
      await completeMs(user, goal.id, await newMilestone(user, goal.id));
      await setStatus(user, goal.id, 'completed');

      await setStatus(user, goal.id, 'active');

      expect((await progress(user)).total.xp).toBe(100);
    });

    it('concluir de novo depois de reabrir rende de novo; trocar entre não concluídos não mexe no XP', async () => {
      const { user } = await setup();
      const goal = await newGoal(user);

      expect(action(await setStatus(user, goal.id, 'paused')).xpDelta).toBe(0);
      expect(action(await setStatus(user, goal.id, 'abandoned')).xpDelta).toBe(0);
      expect(action(await setStatus(user, goal.id, 'active')).xpDelta).toBe(0);
      expect(action(await setStatus(user, goal.id, 'completed')).xpDelta).toBe(500);
      await setStatus(user, goal.id, 'active');
      expect(action(await setStatus(user, goal.id, 'completed')).total.xp).toBe(500);
    });

    it('concluída e abandonada nunca aparecem como atrasadas (RN22)', async () => {
      const { user } = await setup();
      const goal = await newGoal(user, { deadline: '2026-10-01' });
      expect((await call('get', user, `/api/goals/${goal.id}`)).body.overdue).toBe(true);

      expect(action(await setStatus(user, goal.id, 'completed')).goal.overdue).toBe(false);
      expect(action(await setStatus(user, goal.id, 'abandoned')).goal.overdue).toBe(false);
      expect(action(await setStatus(user, goal.id, 'paused')).goal.overdue).toBe(true);
    });

    it('meta atrasada não perde XP (RN22)', async () => {
      const { user } = await setup();
      const goal = await newGoal(user, { deadline: '2026-10-01' });
      await completeMs(user, goal.id, await newMilestone(user, goal.id));

      expect((await progress(user)).total.xp).toBe(100);
    });

    it('rejeita status inválido (400), status ausente e meta alheia (404)', async () => {
      const [ana, bia] = [await setup(), await setup()];
      const goal = await newGoal(ana.user);

      expect((await setStatus(ana.user, goal.id, 'done')).status).toBe(400);
      expect((await call('put', ana.user, `/api/goals/${goal.id}/status`, {})).status).toBe(400);
      expect((await setStatus(bia.user, goal.id, 'completed')).status).toBe(404);
      expect(await ledger(bia.user.userId)).toHaveLength(0);
    });

    it('filtra a lista por status', async () => {
      const { user } = await setup();
      const open = await newGoal(user, { title: 'Aberta' });
      const done = await newGoal(user, { title: 'Feita' });
      await setStatus(user, done.id, 'completed');

      const ids = async (status: string) =>
        (await call('get', user, `/api/goals?status=${status}`)).body.map(
          (g: { id: string }) => g.id,
        );
      expect(await ids('active')).toEqual([open.id]);
      expect(await ids('completed')).toEqual([done.id]);
      expect(await ids('paused')).toEqual([]);
      expect((await call('get', user, '/api/goals?status=x')).status).toBe(400);
    });

    it('concluir a mesma meta em paralelo rende 500, não mais', async () => {
      const { user } = await setup();
      const goal = await newGoal(user);

      await Promise.all([1, 2, 3].map(() => setStatus(user, goal.id, 'completed')));

      expect((await progress(user)).total.xp).toBe(500);
      expect(await ledger(user.userId)).toHaveLength(1);
    });
  });

  describe('excluir (devolve o XP)', () => {
    it('excluir um marco concluído estorna o XP dele', async () => {
      const { user } = await setup();
      const goal = await newGoal(user);
      const ms = await newMilestone(user, goal.id);
      await completeMs(user, goal.id, ms);

      const res = await call('delete', user, `/api/goals/${goal.id}/milestones/${ms}`);

      expect(res.status).toBe(200);
      expect((await progress(user)).total.xp).toBe(0);
      expect((await ledger(user.userId)).map((e) => e.amount)).toEqual([100, -100]);
    });

    it('excluir um marco não concluído não mexe no XP', async () => {
      const { user } = await setup();
      const goal = await newGoal(user);
      const done = await newMilestone(user, goal.id, 'Feito');
      const open = await newMilestone(user, goal.id, 'Aberto');
      await completeMs(user, goal.id, done);

      await call('delete', user, `/api/goals/${goal.id}/milestones/${open}`);

      expect((await progress(user)).total.xp).toBe(100);
      expect(await ledger(user.userId)).toHaveLength(1);
    });

    it('excluir uma meta concluída com marcos concluídos devolve todo o XP', async () => {
      const { user, areaId } = await setup();
      const goal = await newGoal(user, { areaId });
      await completeMs(user, goal.id, await newMilestone(user, goal.id, 'A'));
      await completeMs(user, goal.id, await newMilestone(user, goal.id, 'B'));
      await setStatus(user, goal.id, 'completed');
      expect((await progress(user)).total.xp).toBe(700);

      expect((await call('delete', user, `/api/goals/${goal.id}`)).status).toBe(204);

      const p = await progress(user);
      expect(p.total.xp).toBe(0);
      expect(p.areas.find((a) => a.areaId === areaId)?.xp).toBe(0);
      const entries = await ledger(user.userId);
      expect(entries.reduce((sum, e) => sum + e.amount, 0)).toBe(0);
      expect(entries.filter((e) => e.type === 'REVERSAL')).toHaveLength(3);
    });

    it('não estorna de novo o que já tinha sido estornado antes de excluir', async () => {
      const { user } = await setup();
      const goal = await newGoal(user);
      const ms = await newMilestone(user, goal.id);
      await completeMs(user, goal.id, ms);
      await undoMs(user, goal.id, ms);

      await call('delete', user, `/api/goals/${goal.id}`);

      expect((await ledger(user.userId)).map((e) => e.amount)).toEqual([100, -100]);
    });

    it('excluir a meta de outra pessoa não estorna nada', async () => {
      const [ana, bia] = [await setup(), await setup()];
      const goal = await newGoal(ana.user);
      await setStatus(ana.user, goal.id, 'completed');

      await call('delete', bia.user, `/api/goals/${goal.id}`);

      expect((await progress(ana.user)).total.xp).toBe(500);
    });

    it('excluir a meta solta o vínculo dos blocos sem apagá-los', async () => {
      const { user } = await setup();
      const goal = await newGoal(user);
      const activity = await prisma.activity.findFirstOrThrow({ where: { userId: user.userId } });
      const block = await prisma.block.create({
        data: {
          userId: user.userId,
          activityId: activity.id,
          goalId: goal.id,
          recurrence: 'ONCE',
          date: new Date('2026-10-07T00:00:00.000Z'),
          startTime: '09:00',
          durationMin: 60,
        },
      });

      await call('delete', user, `/api/goals/${goal.id}`);

      expect((await prisma.block.findUniqueOrThrow({ where: { id: block.id } })).goalId).toBeNull();
    });
  });

  describe('reconstrução dos caches a partir do livro-caixa', () => {
    it('com XP de metas (com e sem área), os caches batem e o rebuild corrige uma corrupção', async () => {
      const { user, areaId } = await setup();
      const withArea = await newGoal(user, { areaId });
      const noArea = await newGoal(user);
      await completeMs(user, withArea.id, await newMilestone(user, withArea.id));
      await setStatus(user, withArea.id, 'completed');
      await completeMs(user, noArea.id, await newMilestone(user, noArea.id));

      const rebuild = app.get(CacheRebuildService);
      expect(await rebuild.check(user.userId)).toEqual([]);

      await prisma.user.update({ where: { id: user.userId }, data: { cachedTotalXp: 5 } });
      await prisma.areaProgress.update({
        where: { areaId },
        data: { cachedXp: 7, cachedLevel: 3 },
      });
      expect((await rebuild.check(user.userId)).length).toBe(2);

      const report = await rebuild.rebuild(user.userId);
      expect(report.discrepancies).toHaveLength(2);
      expect(await rebuild.check(user.userId)).toEqual([]);
      expect((await progress(user)).total.xp).toBe(700);
    });
  });

  describe('invariante: o saldo sempre bate com um modelo independente', () => {
    it('operações aleatórias (com semente fixa) mantêm livro-caixa e caches consistentes', async () => {
      const { user, areaId } = await setup();
      const goals = [
        {
          id: (await newGoal(user, { areaId })).id,
          status: 'active',
          ms: [] as { id: string; done: boolean }[],
        },
        {
          id: (await newGoal(user)).id,
          status: 'active',
          ms: [] as { id: string; done: boolean }[],
        },
      ];
      for (const goal of goals) {
        for (const title of ['A', 'B', 'C']) {
          goal.ms.push({ id: await newMilestone(user, goal.id, title), done: false });
        }
      }

      let seed = 12345;
      const rand = (n: number) => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed % n;
      };
      const model = (): number =>
        goals.reduce(
          (sum, g) =>
            sum + g.ms.filter((m) => m.done).length * 100 + (g.status === 'completed' ? 500 : 0),
          0,
        );

      for (let i = 0; i < 80; i += 1) {
        const goal = goals[rand(goals.length)]!;
        const kind = rand(3);
        if (kind === 0) {
          const ms = goal.ms[rand(goal.ms.length)]!;
          const open = goal.status === 'active' || goal.status === 'paused';
          const res = await completeMs(user, goal.id, ms.id);
          if (ms.done) expect(res.status).toBe(200);
          else if (open) {
            expect(res.status).toBe(200);
            ms.done = true;
          } else expect(res.status).toBe(409);
        } else if (kind === 1) {
          const ms = goal.ms[rand(goal.ms.length)]!;
          const open = goal.status === 'active' || goal.status === 'paused';
          const res = await undoMs(user, goal.id, ms.id);
          if (!ms.done) expect(res.status).toBe(200);
          else if (open) {
            expect(res.status).toBe(200);
            ms.done = false;
          } else expect(res.status).toBe(409);
        } else {
          const status = ['active', 'paused', 'abandoned', 'completed'][rand(4)]!;
          expect((await setStatus(user, goal.id, status)).status).toBe(200);
          goal.status = status;
        }
        expect((await progress(user)).total.xp).toBe(model());
      }
    });
  });
});
