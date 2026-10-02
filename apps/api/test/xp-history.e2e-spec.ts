import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { goalSchema, xpHistoryPageSchema } from '@lifexp/shared';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  FakeClock,
  bearer,
  createTestApp,
  listActivities,
  registerUser,
  type TestUser,
} from './helpers.js';

const NOON = '2026-10-07T15:00:00.000Z'; // quarta 12:00 em São Paulo

describe('Histórico de XP por origem (e2e, RF53)', () => {
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

  const send = (
    method: 'post' | 'put' | 'delete' | 'get' | 'patch',
    user: TestUser,
    path: string,
    body?: object,
  ) => {
    const req = request(server())[method](path).set(bearer(user));
    return body ? req.send(body) : req;
  };
  const page = async (user: TestUser, query = '') => {
    const res = await send('get', user, `/api/xp/history${query}`);
    expect(res.status).toBe(200);
    return xpHistoryPageSchema.parse(res.body);
  };
  const newGoal = async (user: TestUser, body: object = {}) =>
    goalSchema.parse((await send('post', user, '/api/goals', { title: 'Meta', ...body })).body);
  const newMilestone = async (user: TestUser, goalId: string, title: string) =>
    goalSchema
      .parse((await send('post', user, `/api/goals/${goalId}/milestones`, { title })).body)
      .milestones.at(-1)!.id;
  const completeMs = async (user: TestUser, goalId: string, ms: string) =>
    expect(
      (await send('post', user, `/api/goals/${goalId}/milestones/${ms}/completion`)).status,
    ).toBe(200);
  const undoMs = async (user: TestUser, goalId: string, ms: string) =>
    expect(
      (await send('delete', user, `/api/goals/${goalId}/milestones/${ms}/completion`)).status,
    ).toBe(200);
  const completeGoal = async (user: TestUser, goalId: string) =>
    expect(
      (await send('put', user, `/api/goals/${goalId}/status`, { status: 'completed' })).status,
    ).toBe(200);
  /** Cria um bloco avulso de 60 min hoje às 09:00 e conclui: +60 XP na área da atividade. */
  const completeBlock = async (user: TestUser) => {
    const [activity] = await listActivities(app, user);
    const block = await send('post', user, '/api/blocks', {
      recurrence: 'once',
      activityId: activity!.id,
      date: '2026-10-07',
      startTime: '09:00',
      durationMin: 60,
    });
    expect(block.status).toBe(201);
    const path = `/api/blocks/${block.body.id}/occurrences/2026-10-07/completion`;
    expect((await send('post', user, path)).status).toBeLessThan(300);
    return { activity: activity!, undo: () => send('delete', user, path) };
  };
  /** N marcos concluídos = N lançamentos de +100, do mais antigo ao mais novo. */
  const seedMilestones = async (user: TestUser, count: number) => {
    const goal = await newGoal(user);
    for (let index = 1; index <= count; index += 1) {
      await completeMs(user, goal.id, await newMilestone(user, goal.id, `Marco ${index}`));
    }
    return goal;
  };

  it('exige login', async () => {
    expect((await request(server()).get('/api/xp/history')).status).toBe(401);
  });

  it('conta nova: histórico vazio, sem cursor', async () => {
    expect(await page(await registerUser(app))).toEqual({ items: [], nextCursor: null });
  });

  it('mostra bloco, marco e meta com origem, área, valor e data, do mais novo ao mais antigo', async () => {
    const user = await registerUser(app);
    const { activity } = await completeBlock(user);
    const area = await prisma.area.findUniqueOrThrow({ where: { id: activity.areaId } });
    clock.set('2026-10-07T16:00:00.000Z');
    const goal = await newGoal(user, { title: 'Escrever o livro', areaId: area.id });
    await completeMs(user, goal.id, await newMilestone(user, goal.id, 'Primeiro capítulo'));
    clock.set('2026-10-07T17:00:00.000Z');
    await completeGoal(user, goal.id);

    const { items, nextCursor } = await page(user);

    expect(nextCursor).toBeNull();
    expect(items.map((entry) => ({ ...entry, id: undefined }))).toEqual([
      {
        id: undefined,
        type: 'goal',
        amount: 500,
        areaId: area.id,
        areaName: area.name,
        createdAt: '2026-10-07T17:00:00.000Z',
        sourceLabel: 'Escrever o livro',
        reversedType: null,
      },
      {
        id: undefined,
        type: 'milestone',
        amount: 100,
        areaId: area.id,
        areaName: area.name,
        createdAt: '2026-10-07T16:00:00.000Z',
        sourceLabel: 'Primeiro capítulo',
        reversedType: null,
      },
      {
        id: undefined,
        type: 'completion',
        amount: 60,
        areaId: area.id,
        areaName: area.name,
        createdAt: NOON,
        sourceLabel: activity.name,
        reversedType: null,
      },
    ]);
  });

  it('o estorno aparece como lançamento próprio, negativo, com a origem estornada', async () => {
    const user = await registerUser(app);
    const { activity, undo } = await completeBlock(user);
    expect((await undo()).status).toBeLessThan(300);
    const goal = await newGoal(user);
    const ms = await newMilestone(user, goal.id, 'Rascunho');
    await completeMs(user, goal.id, ms);
    await undoMs(user, goal.id, ms);

    const { items } = await page(user);

    expect(items.map((e) => [e.type, e.amount, e.reversedType, e.sourceLabel])).toEqual([
      ['reversal', -100, 'milestone', 'Rascunho'],
      ['milestone', 100, null, 'Rascunho'],
      ['reversal', -60, 'completion', activity.name],
      ['completion', 60, null, activity.name],
    ]);
    // meta sem área: o XP do marco não vai para nenhuma área
    expect(items[0]).toMatchObject({ areaId: null, areaName: null });
  });

  it('a conclusão mostra o nome atual da atividade (atividade é arquivada, nunca excluída)', async () => {
    const user = await registerUser(app);
    const { activity } = await completeBlock(user);
    await send('patch', user, `/api/activities/${activity.id}`, { name: 'Novo nome' });
    expect((await page(user)).items[0]!.sourceLabel).toBe('Novo nome');
  });

  it('origem excluída: os lançamentos continuam no histórico, sem nome', async () => {
    const user = await registerUser(app);
    const goal = await newGoal(user, { title: 'Vai sumir' });
    await completeMs(user, goal.id, await newMilestone(user, goal.id, 'Marco que some'));
    await completeGoal(user, goal.id);
    expect((await send('delete', user, `/api/goals/${goal.id}`)).status).toBeLessThan(300);

    const { items } = await page(user);

    expect(items).toHaveLength(4); // marco, meta e os dois estornos da exclusão
    expect(items.every((entry) => entry.sourceLabel === null)).toBe(true);
    expect(items.map((e) => e.amount).sort((a, b) => a - b)).toEqual([-500, -100, 100, 500]);
    expect(
      items
        .filter((e) => e.type === 'reversal')
        .map((e) => e.reversedType)
        .sort(),
    ).toEqual(['goal', 'milestone']);
  });

  it('a soma do histórico inteiro é o XP total da pessoa', async () => {
    const user = await registerUser(app);
    const { undo } = await completeBlock(user);
    await undo();
    await seedMilestones(user, 3);

    const { items } = await page(user, '?limit=50');
    const total = items.reduce((sum, entry) => sum + entry.amount, 0);

    expect(total).toBe(300);
    expect((await send('get', user, '/api/progress')).body.total.xp).toBe(total);
  });

  describe('bônus da quest semanal (RN17)', () => {
    const questEntry = async (user: TestUser, weekStart = '2026-10-05') => {
      const quest = await prisma.weeklyQuest.create({
        data: {
          userId: user.userId,
          weekStart: new Date(`${weekStart}T00:00:00.000Z`),
          createdAt: clock.now(),
        },
      });
      const award = await prisma.xpTransaction.create({
        data: {
          userId: user.userId,
          amount: 120,
          type: 'QUEST',
          sourceId: quest.id,
          createdAt: clock.now(),
        },
      });
      return { quest, award };
    };

    it('aparece com o nome da semana, sem área, e o estorno diz o que estornou', async () => {
      const user = await registerUser(app);
      const { quest, award } = await questEntry(user);
      clock.set('2026-10-07T16:00:00.000Z');
      await prisma.xpTransaction.create({
        data: {
          userId: user.userId,
          amount: -120,
          type: 'REVERSAL',
          sourceId: quest.id,
          reversedTransactionId: award.id,
          createdAt: clock.now(),
        },
      });

      const { items } = await page(user);

      expect(items.map((e) => [e.type, e.amount, e.reversedType, e.sourceLabel, e.areaId])).toEqual(
        [
          ['reversal', -120, 'quest', 'Quest da semana de 05/10', null],
          ['quest', 120, null, 'Quest da semana de 05/10', null],
        ],
      );
    });

    it('filtra por "quest" e o nome da quest de outra pessoa não vaza (RS06)', async () => {
      const [a, b] = [await registerUser(app), await registerUser(app)];
      await questEntry(a, '2026-09-28');
      const { quest } = await questEntry(b, '2026-10-05');
      // lançamento de Bia apontando para a quest de Ana (estado impossível pela API)
      const anaQuest = await prisma.weeklyQuest.findFirstOrThrow({ where: { userId: a.userId } });
      await prisma.xpTransaction.create({
        data: {
          userId: b.userId,
          amount: 30,
          type: 'QUEST',
          sourceId: anaQuest.id,
          createdAt: clock.now(),
        },
      });

      const own = await page(b, '?type=quest');
      expect(own.items).toHaveLength(2);
      expect(new Set(own.items.map((e) => e.sourceLabel))).toEqual(
        new Set([null, 'Quest da semana de 05/10']),
      );
      expect(JSON.stringify(own)).not.toContain('28/09');
      expect(quest.id).toBeDefined();
      expect((await page(b, '?type=completion')).items).toEqual([]);
    });
  });

  describe('filtro por origem', () => {
    it('traz só o tipo pedido', async () => {
      const user = await registerUser(app);
      const { undo } = await completeBlock(user);
      await undo();
      const goal = await seedMilestones(user, 2);
      await completeGoal(user, goal.id);

      const types = async (type: string) =>
        (await page(user, `?type=${type}`)).items.map((entry) => entry.type);
      expect(await types('completion')).toEqual(['completion']);
      expect(await types('milestone')).toEqual(['milestone', 'milestone']);
      expect(await types('goal')).toEqual(['goal']);
      expect(await types('reversal')).toEqual(['reversal']);
      expect((await page(user)).items).toHaveLength(5);
    });

    it('o filtro vale junto com a paginação', async () => {
      const user = await registerUser(app);
      await completeBlock(user);
      await seedMilestones(user, 3);
      await completeBlock(user);

      const first = await page(user, '?type=milestone&limit=2');
      expect(first.items.map((e) => e.sourceLabel)).toEqual(['Marco 3', 'Marco 2']);
      const second = await page(user, `?type=milestone&limit=2&before=${first.nextCursor}`);
      expect(second.items.map((e) => e.sourceLabel)).toEqual(['Marco 1']);
      expect(second.nextCursor).toBeNull();
    });

    it('rejeita tipo desconhecido (400)', async () => {
      const user = await registerUser(app);
      expect((await send('get', user, '/api/xp/history?type=conquista')).status).toBe(400);
    });
  });

  describe('paginação (RNF08)', () => {
    it('pagina por cursor sem repetir nem pular lançamentos', async () => {
      const user = await registerUser(app);
      await seedMilestones(user, 5);
      const expected = ['Marco 5', 'Marco 4', 'Marco 3', 'Marco 2', 'Marco 1'];

      const first = await page(user, '?limit=2');
      expect(first.items.map((e) => e.sourceLabel)).toEqual(expected.slice(0, 2));
      expect(first.nextCursor).toBe(first.items[1]!.id);

      const second = await page(user, `?limit=2&before=${first.nextCursor}`);
      expect(second.items.map((e) => e.sourceLabel)).toEqual(expected.slice(2, 4));

      const third = await page(user, `?limit=2&before=${second.nextCursor}`);
      expect(third.items.map((e) => e.sourceLabel)).toEqual(expected.slice(4));
      expect(third.nextCursor).toBeNull();
    });

    it('uma página exatamente cheia no fim não promete outra', async () => {
      const user = await registerUser(app);
      await seedMilestones(user, 3);
      const { items, nextCursor } = await page(user, '?limit=3');
      expect(items).toHaveLength(3);
      expect(nextCursor).toBeNull();
    });

    it('o limite padrão é 20 e o máximo é 50', async () => {
      const user = await registerUser(app);
      await seedMilestones(user, 21);

      const first = await page(user);
      expect(first.items).toHaveLength(20);
      expect(first.nextCursor).not.toBeNull();
      expect((await send('get', user, '/api/xp/history?limit=51')).status).toBe(400);
      expect((await send('get', user, '/api/xp/history?limit=0')).status).toBe(400);
      expect((await send('get', user, '/api/xp/history?before=abc')).status).toBe(400);
    });

    it('usa um número fixo de consultas, não importa o tamanho da página (sem N+1)', async () => {
      const user = await registerUser(app);
      const queries: string[] = [];
      let counting = false;
      (prisma as unknown as { $on(e: 'query', cb: (q: { query: string }) => void): void }).$on(
        'query',
        (event) => {
          // Fora as de controle de transação e a consulta de sessão do guard (uma por requisição).
          const control = /^(BEGIN|COMMIT|SET|SHOW|DEALLOCATE)/i.test(event.query);
          if (counting && !control && !event.query.includes('"Session"')) {
            queries.push(event.query);
          }
        },
      );
      const countFor = async () => {
        queries.length = 0;
        counting = true;
        await page(user, '?limit=50');
        counting = false;
        return queries.length;
      };

      const goal = await seedMilestones(user, 1);
      await completeBlock(user);
      await completeGoal(user, goal.id);
      const withFew = await countFor();
      await seedMilestones(user, 12);
      const withMany = await countFor();

      expect(withFew).toBeGreaterThan(0);
      expect(withMany).toBe(withFew);
      // livro-caixa + conclusões + atividades + marcos + metas
      expect(withFew).toBeLessThanOrEqual(5);
    });
  });

  describe('isolamento (RS06)', () => {
    it('cada pessoa vê só os próprios lançamentos', async () => {
      const ana = await registerUser(app);
      const bia = await registerUser(app);
      await seedMilestones(ana, 2);
      await completeBlock(bia);

      expect((await page(ana)).items.map((e) => e.type)).toEqual(['milestone', 'milestone']);
      expect((await page(bia)).items.map((e) => e.type)).toEqual(['completion']);
    });

    it('o cursor de outra pessoa não abre o histórico dela', async () => {
      const ana = await registerUser(app);
      const bia = await registerUser(app);
      await seedMilestones(ana, 2);
      await seedMilestones(bia, 2);
      const anaNewest = (await page(ana)).items[0]!.id;
      const biaNewest = (await page(bia)).items[0]!.id;

      const biaWithAnaCursor = await page(bia, `?before=${anaNewest}`);
      const anaWithBiaCursor = await page(ana, `?before=${biaNewest}`);

      const mine = async (user: TestUser, ids: string[]) =>
        prisma.xpTransaction.count({ where: { id: { in: ids }, userId: user.userId } });
      const biaIds = biaWithAnaCursor.items.map((e) => e.id);
      const anaIds = anaWithBiaCursor.items.map((e) => e.id);
      expect(await mine(bia, biaIds)).toBe(biaIds.length);
      expect(await mine(ana, anaIds)).toBe(anaIds.length);
      expect(anaIds).toHaveLength(2); // os de Bia são mais novos: Ana continua vendo os dela
    });

    it('não vaza o nome de uma origem alheia, mesmo com um lançamento apontando para ela', async () => {
      const ana = await registerUser(app);
      const bia = await registerUser(app);
      const goal = await newGoal(ana, { title: 'Segredo da Ana' });
      const ms = await newMilestone(ana, goal.id, 'Marco secreto');
      await completeBlock(ana);
      const completion = await prisma.completion.findFirstOrThrow({
        where: { userId: ana.userId },
      });
      // Estado impossível pela API, forçado no banco: lançamentos de Bia com origem de Ana.
      for (const [type, sourceId] of [
        ['GOAL', goal.id],
        ['MILESTONE', ms],
        ['COMPLETION', completion.id],
      ] as const) {
        await prisma.xpTransaction.create({
          data: { userId: bia.userId, amount: 10, type, sourceId, createdAt: clock.now() },
        });
      }
      await prisma.user.update({ where: { id: bia.userId }, data: { cachedTotalXp: 30 } });

      const { items } = await page(bia);

      expect(items).toHaveLength(3);
      expect(items.map((e) => e.sourceLabel)).toEqual([null, null, null]);
    });
  });
});
