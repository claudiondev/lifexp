import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  MAX_OPEN_TASKS,
  MAX_TASK_ITEMS,
  TASK_DAILY_XP_CAP,
  taskCompletionResultSchema,
  taskListSchema,
  taskSchema,
  taskUndoResultSchema,
} from '@lifexp/shared';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  FakeClock,
  bearer,
  createTestApp,
  expectCachesConsistent,
  registerUser,
  type TestUser,
} from './helpers.js';

// Quarta 2026-10-07, 12:00 em São Paulo (UTC-3).
const NOON = '2026-10-07T15:00:00.000Z';
const TODAY = '2026-10-07';
const YESTERDAY = '2026-10-06';
const TOMORROW = '2026-10-08';
const NEXT_DAY_NOON = '2026-10-08T15:00:00.000Z';

describe('Tarefas (e2e, Marco 5a)', () => {
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

  const setup = async (timezone?: string) => {
    const user = await registerUser(app);
    if (timezone) {
      await request(server()).patch('/api/users/me').set(bearer(user)).send({ timezone });
    }
    usersToCheck.push(user.userId);
    const areas = (await request(server()).get('/api/areas').set(bearer(user))).body as {
      id: string;
    }[];
    return { user, areaId: areas[0]!.id, otherAreaId: areas[1]!.id };
  };
  const send = (
    method: 'post' | 'patch' | 'get' | 'delete' | 'put',
    user: TestUser,
    path: string,
    body?: object,
  ) => {
    const req = request(server())[method](path).set(bearer(user));
    return body ? req.send(body) : req;
  };
  const create = async (user: TestUser, body: object) => {
    const res = await send('post', user, '/api/tasks', body);
    expect(res.status).toBe(201);
    return res.body as { id: string } & Record<string, unknown>;
  };
  const list = async (user: TestUser, scope: 'today' | 'inbox' = 'today') => {
    const res = await send('get', user, `/api/tasks?scope=${scope}`);
    expect(res.status).toBe(200);
    return taskListSchema.parse(res.body);
  };
  const titles = async (user: TestUser, scope: 'today' | 'inbox' = 'today') =>
    (await list(user, scope)).tasks.map((task) => task.title);
  const complete = (user: TestUser, id: string) => send('post', user, `/api/tasks/${id}/complete`);
  const undo = (user: TestUser, id: string) => send('delete', user, `/api/tasks/${id}/complete`);
  const ledgerOf = (userId: string) =>
    prisma.xpTransaction.findMany({ where: { userId }, orderBy: { id: 'asc' } });

  describe('autenticação', () => {
    it('toda rota exige login', async () => {
      const id = '0192f1a0-7b3c-7000-8000-000000000001';
      const calls = [
        request(server()).get('/api/tasks'),
        request(server()).post('/api/tasks').send({}),
        request(server()).patch(`/api/tasks/${id}`).send({}),
        request(server()).delete(`/api/tasks/${id}`),
        request(server()).post(`/api/tasks/${id}/complete`),
        request(server()).delete(`/api/tasks/${id}/complete`),
        request(server()).post(`/api/tasks/${id}/items`).send({}),
        request(server()).patch(`/api/tasks/${id}/items/${id}`).send({}),
        request(server()).delete(`/api/tasks/${id}/items/${id}`),
      ];
      for (const res of await Promise.all(calls)) expect(res.status).toBe(401);
    });
  });

  describe('POST /tasks', () => {
    it('só o título: sem dia (Pendentes), prioridade média, sem área nem meta', async () => {
      const { user } = await setup();

      const res = await send('post', user, '/api/tasks', { title: 'Comprar pão' });

      expect(res.status).toBe(201);
      expect(taskSchema.safeParse(res.body).success).toBe(true);
      expect(res.body).toMatchObject({
        title: 'Comprar pão',
        note: null,
        dueDate: null,
        priority: 'medium',
        areaId: null,
        goalId: null,
        completedAt: null,
        xpAwarded: 0,
        xpPreview: 20,
        carriedFrom: null,
        items: [],
      });
      const stored = await prisma.task.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(stored.userId).toBe(user.userId);
    });

    it('com todos os campos', async () => {
      const { user, areaId } = await setup();
      const goal = (await send('post', user, '/api/goals', { title: 'Meta', areaId })).body;

      const res = await send('post', user, '/api/tasks', {
        title: '  Pagar a conta  ',
        note: '  vence hoje  ',
        dueDate: TODAY,
        priority: 'high',
        areaId,
        goalId: goal.id,
      });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        title: 'Pagar a conta',
        note: 'vence hoje',
        dueDate: TODAY,
        priority: 'high',
        xpPreview: 40,
        areaId,
        goalId: goal.id,
      });
    });

    it('o XP previsto segue a prioridade: 10, 20 e 40', async () => {
      const { user } = await setup();
      const previews = [];
      for (const priority of ['low', 'medium', 'high']) {
        previews.push((await create(user, { title: priority, priority }))['xpPreview']);
      }
      expect(previews).toEqual([10, 20, 40]);
    });

    it('recusa título vazio, só espaços ou com mais de 120 caracteres', async () => {
      const { user } = await setup();
      for (const title of ['', '   ', 'a'.repeat(121), undefined, 5]) {
        expect((await send('post', user, '/api/tasks', { title })).status).toBe(400);
      }
      expect((await send('post', user, '/api/tasks', { title: 'a'.repeat(120) })).status).toBe(201);
    });

    it('anotação: apara, vazio vira nulo, até 500 caracteres, só texto', async () => {
      const { user } = await setup();
      const blank = await send('post', user, '/api/tasks', { title: 'a', note: '   ' });
      expect(blank.body.note).toBeNull();
      const edge = await send('post', user, '/api/tasks', { title: 'b', note: 'x'.repeat(500) });
      expect(edge.status).toBe(201);
      for (const note of ['x'.repeat(501), 7, { a: 1 }]) {
        expect((await send('post', user, '/api/tasks', { title: 'c', note })).status).toBe(400);
      }
    });

    it('recusa campo desconhecido, prioridade ou data inválidas (RS07)', async () => {
      const { user } = await setup();
      const bad = [
        { title: 'a', userId: 'x' },
        { title: 'a', xpAwarded: 99 },
        { title: 'a', completedAt: '2026-10-07T00:00:00.000Z' },
        { title: 'a', priority: 'urgent' },
        { title: 'a', priority: 'HIGH' },
        { title: 'a', dueDate: '2026-02-30' },
        { title: 'a', dueDate: 'amanhã' },
        { title: 'a', areaId: 'não-é-uuid' },
      ];
      for (const body of bad) {
        expect([
          JSON.stringify(body),
          (await send('post', user, '/api/tasks', body)).status,
        ]).toEqual([JSON.stringify(body), 400]);
      }
    });

    it('área ou meta de outra pessoa responde 404, igual a inexistente (RS06)', async () => {
      const mine = await setup();
      const other = await setup();
      const otherGoal = (
        await send('post', other.user, '/api/goals', { title: 'Alheia', areaId: other.areaId })
      ).body;

      const area = await send('post', mine.user, '/api/tasks', {
        title: 'a',
        areaId: other.areaId,
      });
      const goal = await send('post', mine.user, '/api/tasks', {
        title: 'a',
        goalId: otherGoal.id,
      });

      expect(area.status).toBe(404);
      expect(goal.status).toBe(404);
      expect(await prisma.task.count({ where: { userId: mine.user.userId } })).toBe(0);
    });

    it('meta concluída ou abandonada não recebe tarefas (409); pausada recebe', async () => {
      const { user } = await setup();
      const goal = (await send('post', user, '/api/goals', { title: 'Meta' })).body;

      await send('put', user, `/api/goals/${goal.id}/status`, { status: 'paused' });
      expect((await send('post', user, '/api/tasks', { title: 'a', goalId: goal.id })).status).toBe(
        201,
      );

      for (const status of ['completed', 'abandoned']) {
        await send('put', user, `/api/goals/${goal.id}/status`, { status });
        const res = await send('post', user, '/api/tasks', { title: 'b', goalId: goal.id });
        expect(res.status).toBe(409);
        expect(res.body.message).toMatch(/Reabra a meta/);
      }
    });

    it(`limita as tarefas em aberto a ${MAX_OPEN_TASKS} (409), e concluídas ou arquivadas não contam`, async () => {
      const { user } = await setup();
      await prisma.task.createMany({
        data: Array.from({ length: MAX_OPEN_TASKS - 2 }, (_, index) => ({
          userId: user.userId,
          title: `t${index}`,
        })),
      });
      await prisma.task.create({
        data: { userId: user.userId, title: 'feita', completedAt: new Date(NOON) },
      });
      await prisma.task.create({
        data: { userId: user.userId, title: 'arquivada', archivedAt: new Date(NOON) },
      });

      expect((await send('post', user, '/api/tasks', { title: 'a' })).status).toBe(201);
      expect((await send('post', user, '/api/tasks', { title: 'b' })).status).toBe(201);
      expect((await send('post', user, '/api/tasks', { title: 'c' })).status).toBe(409);
    });
  });

  describe('GET /tasks (Hoje e Pendentes)', () => {
    it('Hoje traz as de hoje e as atrasadas ("vinda de"); não traz futuras nem sem dia', async () => {
      const { user } = await setup();
      await create(user, { title: 'hoje', dueDate: TODAY });
      await create(user, { title: 'ontem', dueDate: YESTERDAY });
      await create(user, { title: 'amanhã', dueDate: TOMORROW });
      await create(user, { title: 'sem dia' });

      const { tasks } = await list(user, 'today');

      expect(tasks.map((t) => [t.title, t.carriedFrom])).toEqual([
        ['ontem', YESTERDAY],
        ['hoje', null],
      ]);
    });

    it('Pendentes traz só as em aberto e sem dia', async () => {
      const { user } = await setup();
      await create(user, { title: 'hoje', dueDate: TODAY });
      const inbox = await create(user, { title: 'sem dia' });
      const done = await create(user, { title: 'sem dia feita' });
      await complete(user, done.id);

      expect(await titles(user, 'inbox')).toEqual(['sem dia']);
      expect((await list(user, 'inbox')).tasks[0]!.id).toBe(inbox.id);
    });

    it('sem o parâmetro scope, assume Hoje; scope inválido é 400', async () => {
      const { user } = await setup();
      await create(user, { title: 'hoje', dueDate: TODAY });
      await create(user, { title: 'sem dia' });

      const res = await send('get', user, '/api/tasks');

      expect(res.body.tasks.map((t: { title: string }) => t.title)).toEqual(['hoje']);
      expect((await send('get', user, '/api/tasks?scope=tudo')).status).toBe(400);
    });

    it('ordem: mais antigas primeiro, depois prioridade, concluídas por último', async () => {
      const { user } = await setup();
      await create(user, { title: 'hoje baixa', dueDate: TODAY, priority: 'low' });
      await create(user, { title: 'hoje alta', dueDate: TODAY, priority: 'high' });
      await create(user, { title: 'ontem', dueDate: YESTERDAY, priority: 'low' });
      const done = await create(user, { title: 'feita', dueDate: TODAY, priority: 'high' });
      await complete(user, done.id);

      expect(await titles(user)).toEqual(['ontem', 'hoje alta', 'hoje baixa', 'feita']);
    });

    it('uma tarefa concluída hoje continua em Hoje (qualquer que seja o dia dela)', async () => {
      const { user } = await setup();
      const old = await create(user, { title: 'antiga', dueDate: '2026-09-01' });
      const loose = await create(user, { title: 'solta' });
      clock.set('2026-10-07T13:00:00.000Z');
      await complete(user, old.id);
      clock.set('2026-10-07T14:00:00.000Z');
      await complete(user, loose.id);

      // a mais recentemente concluída aparece primeiro
      expect(await titles(user)).toEqual(['solta', 'antiga']);
    });

    it('no dia seguinte: a aberta vira "vinda de ontem" e a concluída sai de Hoje', async () => {
      const { user } = await setup();
      await create(user, { title: 'aberta', dueDate: TODAY });
      const done = await create(user, { title: 'feita', dueDate: TODAY });
      await complete(user, done.id);

      clock.set(NEXT_DAY_NOON);
      const { tasks } = await list(user);

      expect(tasks.map((t) => [t.title, t.carriedFrom])).toEqual([['aberta', TODAY]]);
    });

    it('a "vinda de" some se a tarefa é adiada para hoje, e some das listas se arquivada', async () => {
      const { user } = await setup();
      const late = await create(user, { title: 'atrasada', dueDate: YESTERDAY });
      await send('patch', user, `/api/tasks/${late.id}`, { dueDate: TODAY });
      expect((await list(user)).tasks[0]).toMatchObject({ carriedFrom: null, dueDate: TODAY });

      await send('delete', user, `/api/tasks/${late.id}`);
      expect(await titles(user)).toEqual([]);
    });

    it('não mostra tarefa de outra pessoa', async () => {
      const mine = await setup();
      const other = await setup();
      await create(other.user, { title: 'dela', dueDate: TODAY });
      await create(other.user, { title: 'dela sem dia' });
      await create(mine.user, { title: 'minha', dueDate: TODAY });

      expect(await titles(mine.user)).toEqual(['minha']);
      expect(await titles(mine.user, 'inbox')).toEqual([]);
    });

    it('o dia de hoje segue o fuso da pessoa (Kiribati, UTC+14, já está no dia 8)', async () => {
      const { user } = await setup('Pacific/Kiritimati');
      await create(user, { title: 'dia 7', dueDate: TODAY });
      await create(user, { title: 'dia 8', dueDate: TOMORROW });
      await create(user, { title: 'dia 9', dueDate: '2026-10-09' });

      const { tasks } = await list(user);

      expect(tasks.map((t) => [t.title, t.carriedFrom])).toEqual([
        ['dia 7', TODAY],
        ['dia 8', null],
      ]);
    });

    it('informa o XP de tarefas já ganho hoje e o teto', async () => {
      const { user } = await setup();
      const task = await create(user, { title: 'a', priority: 'high' });
      expect((await list(user)).xpToday).toBe(0);
      await complete(user, task.id);

      const result = await list(user);

      expect(result).toMatchObject({ xpToday: 40, xpCap: TASK_DAILY_XP_CAP });
    });
  });

  describe('PATCH /tasks/:id', () => {
    it('edita os campos; nulo limpa anotação, dia, área e meta; ausente mantém', async () => {
      const { user, areaId } = await setup();
      const goal = (await send('post', user, '/api/goals', { title: 'Meta', areaId })).body;
      const task = await create(user, {
        title: 'a',
        note: 'n',
        dueDate: TODAY,
        priority: 'low',
        areaId,
        goalId: goal.id,
      });

      const renamed = await send('patch', user, `/api/tasks/${task.id}`, { title: 'novo' });
      expect(renamed.body).toMatchObject({
        title: 'novo',
        note: 'n',
        dueDate: TODAY,
        priority: 'low',
        areaId,
        goalId: goal.id,
      });

      const cleared = await send('patch', user, `/api/tasks/${task.id}`, {
        note: null,
        dueDate: null,
        areaId: null,
        goalId: null,
        priority: 'high',
      });
      expect(cleared.status).toBe(200);
      expect(cleared.body).toMatchObject({
        note: null,
        dueDate: null,
        areaId: null,
        goalId: null,
        priority: 'high',
        xpPreview: 40,
      });
      expect(await titles(user, 'inbox')).toEqual(['novo']);
    });

    it('anotação vazia apaga; texto vazio no título é recusado', async () => {
      const { user } = await setup();
      const task = await create(user, { title: 'a', note: 'algo' });

      expect(
        (await send('patch', user, `/api/tasks/${task.id}`, { note: '  ' })).body.note,
      ).toBeNull();
      expect((await send('patch', user, `/api/tasks/${task.id}`, { title: ' ' })).status).toBe(400);
    });

    it('recusa corpo vazio, campo desconhecido e tentar mexer em XP ou conclusão', async () => {
      const { user } = await setup();
      const task = await create(user, { title: 'a' });
      for (const body of [{}, { userId: 'x' }, { xpAwarded: 40 }, { completedAt: null }]) {
        expect([
          JSON.stringify(body),
          (await send('patch', user, `/api/tasks/${task.id}`, body)).status,
        ]).toEqual([JSON.stringify(body), 400]);
      }
    });

    it('tarefa de outra pessoa, inexistente ou arquivada responde 404 (RS06)', async () => {
      const mine = await setup();
      const other = await setup();
      const theirs = await create(other.user, { title: 'dela' });
      const archived = await create(mine.user, { title: 'velha' });
      await send('delete', mine.user, `/api/tasks/${archived.id}`);
      const missing = '0192f1a0-7b3c-7000-8000-00000000dead';

      for (const id of [theirs.id, archived.id, missing]) {
        expect((await send('patch', mine.user, `/api/tasks/${id}`, { title: 'x' })).status).toBe(
          404,
        );
      }
      expect((await prisma.task.findUniqueOrThrow({ where: { id: theirs.id } })).title).toBe(
        'dela',
      );
    });

    it('ligar a área ou meta de outra pessoa é 404, e o vínculo antigo continua', async () => {
      const mine = await setup();
      const other = await setup();
      const task = await create(mine.user, { title: 'a', areaId: mine.areaId });

      const res = await send('patch', mine.user, `/api/tasks/${task.id}`, {
        areaId: other.areaId,
      });

      expect(res.status).toBe(404);
      expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).areaId).toBe(
        mine.areaId,
      );
    });

    it('ligar uma meta de outra pessoa é 404 e uma encerrada é 409; o vínculo antigo continua', async () => {
      const mine = await setup();
      const other = await setup();
      const mineGoal = (await send('post', mine.user, '/api/goals', { title: 'Minha' })).body;
      const closedGoal = (await send('post', mine.user, '/api/goals', { title: 'Encerrada' })).body;
      await send('put', mine.user, `/api/goals/${closedGoal.id}/status`, { status: 'abandoned' });
      const theirGoal = (await send('post', other.user, '/api/goals', { title: 'Alheia' })).body;
      const task = await create(mine.user, { title: 'a', goalId: mineGoal.id });
      const patch = (goalId: string) =>
        send('patch', mine.user, `/api/tasks/${task.id}`, { goalId });

      expect((await patch(theirGoal.id)).status).toBe(404);
      expect((await patch(closedGoal.id)).status).toBe(409);
      expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).goalId).toBe(
        mineGoal.id,
      );
    });

    it('editar a prioridade de uma tarefa concluída não mexe no XP já ganho', async () => {
      const { user } = await setup();
      const task = await create(user, { title: 'a', priority: 'low' });
      await complete(user, task.id);

      const res = await send('patch', user, `/api/tasks/${task.id}`, { priority: 'high' });

      expect(res.body).toMatchObject({ priority: 'high', xpAwarded: 10 });
    });
  });

  describe('DELETE /tasks/:id (arquivar)', () => {
    it('arquiva (204), some das listas, é idempotente, e a linha fica no banco (RN27)', async () => {
      const { user } = await setup();
      const task = await create(user, { title: 'a', dueDate: TODAY });

      expect((await send('delete', user, `/api/tasks/${task.id}`)).status).toBe(204);
      expect((await send('delete', user, `/api/tasks/${task.id}`)).status).toBe(204);

      expect(await titles(user)).toEqual([]);
      const stored = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
      expect(stored.archivedAt).not.toBeNull();
    });

    it('arquivar uma tarefa concluída não mexe no XP', async () => {
      const { user } = await setup();
      const task = await create(user, { title: 'a', priority: 'high' });
      await complete(user, task.id);

      await send('delete', user, `/api/tasks/${task.id}`);

      expect((await ledgerOf(user.userId)).map((entry) => entry.amount)).toEqual([40]);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.userId } })).cachedTotalXp,
      ).toBe(40);
    });

    it('tarefa de outra pessoa ou inexistente responde 404 e não é arquivada', async () => {
      const mine = await setup();
      const other = await setup();
      const theirs = await create(other.user, { title: 'dela' });

      expect((await send('delete', mine.user, `/api/tasks/${theirs.id}`)).status).toBe(404);
      expect(
        (await send('delete', mine.user, '/api/tasks/0192f1a0-7b3c-7000-8000-00000000dead')).status,
      ).toBe(404);
      expect(
        (await prisma.task.findUniqueOrThrow({ where: { id: theirs.id } })).archivedAt,
      ).toBeNull();
    });

    it('arquivada não pode ser concluída nem ter passos mexidos (404)', async () => {
      const { user } = await setup();
      const task = await create(user, { title: 'a' });
      await send('delete', user, `/api/tasks/${task.id}`);

      expect((await complete(user, task.id)).status).toBe(404);
      expect((await send('post', user, `/api/tasks/${task.id}/items`, { title: 'p' })).status).toBe(
        404,
      );
    });
  });

  describe('concluir (POST /tasks/:id/complete)', () => {
    it.each([
      ['low', 10],
      ['medium', 20],
      ['high', 40],
    ] as const)('prioridade %s rende %i XP, no total e na área', async (priority, xp) => {
      const { user, areaId } = await setup();
      const task = await create(user, { title: 'a', priority, areaId, dueDate: TODAY });

      const res = await complete(user, task.id);

      expect(res.status).toBe(200);
      expect(taskCompletionResultSchema.safeParse(res.body).success).toBe(true);
      expect(res.body).toMatchObject({
        alreadyCompleted: false,
        xpAwarded: xp,
        capped: false,
        levelBefore: 1,
        levelAfter: 1,
      });
      expect(res.body.task).toMatchObject({ xpAwarded: xp });
      expect(res.body.task.completedAt).toBe(NOON);
      expect(res.body.total.xp).toBe(xp);
      expect(res.body.area).toMatchObject({ areaId, xp });
      const ledger = await ledgerOf(user.userId);
      expect(ledger).toHaveLength(1);
      expect(ledger[0]).toMatchObject({
        type: 'TASK',
        amount: xp,
        areaId,
        sourceId: task.id,
        reversedTransactionId: null,
      });
      expect(ledger[0]!.createdAt.toISOString()).toBe(NOON);
    });

    it('sem área, conta só no total (area nula)', async () => {
      const { user } = await setup();
      const task = await create(user, { title: 'a', priority: 'low' });

      const res = await complete(user, task.id);

      expect(res.body.area).toBeNull();
      expect(res.body.total.xp).toBe(10);
      expect((await ledgerOf(user.userId))[0]!.areaId).toBeNull();
    });

    it('é idempotente: concluir de novo não dá XP nem cria lançamento', async () => {
      const { user, areaId } = await setup();
      const task = await create(user, { title: 'a', priority: 'high', areaId });
      await complete(user, task.id);

      clock.set('2026-10-07T18:00:00.000Z');
      const again = await complete(user, task.id);

      expect(again.status).toBe(200);
      expect(again.body).toMatchObject({ alreadyCompleted: true, xpAwarded: 0, capped: false });
      expect(again.body.task.completedAt).toBe(NOON); // o instante original não muda
      expect(again.body.total.xp).toBe(40);
      expect(await ledgerOf(user.userId)).toHaveLength(1);
    });

    it('sobe de nível quando o XP cruza a curva (e informa antes e depois)', async () => {
      const { user } = await setup();
      await prisma.user.update({ where: { id: user.userId }, data: { cachedTotalXp: 95 } });
      await prisma.xpTransaction.create({
        data: {
          userId: user.userId,
          amount: 95,
          type: 'COMPLETION',
          createdAt: new Date('2026-10-01'),
        },
      });
      const task = await create(user, { title: 'a', priority: 'low' });

      const res = await complete(user, task.id);

      expect(res.body).toMatchObject({ levelBefore: 1, levelAfter: 2 });
      expect(res.body.total).toMatchObject({ xp: 105, level: 2 });
    });

    it('tarefa de outra pessoa, inexistente ou id que não é UUID: 404 e 400, sem XP', async () => {
      const mine = await setup();
      const other = await setup();
      const theirs = await create(other.user, { title: 'dela' });

      expect((await complete(mine.user, theirs.id)).status).toBe(404);
      expect((await complete(mine.user, '0192f1a0-7b3c-7000-8000-00000000dead')).status).toBe(404);
      expect((await complete(mine.user, 'abc')).status).toBe(400);
      expect(await ledgerOf(mine.user.userId)).toHaveLength(0);
      expect(await ledgerOf(other.user.userId)).toHaveLength(0);
      expect(
        (await prisma.task.findUniqueOrThrow({ where: { id: theirs.id } })).completedAt,
      ).toBeNull();
    });

    it('marcar passos do checklist não conclui a tarefa nem dá XP', async () => {
      const { user } = await setup();
      const task = await create(user, { title: 'a', priority: 'high' });
      const withItem = (await send('post', user, `/api/tasks/${task.id}/items`, { title: 'p' }))
        .body;
      await send('patch', user, `/api/tasks/${task.id}/items/${withItem.items[0].id}`, {
        done: true,
      });

      const stored = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });

      expect(stored.completedAt).toBeNull();
      expect(await ledgerOf(user.userId)).toHaveLength(0);
    });

    it('conclui mesmo com passos em aberto', async () => {
      const { user } = await setup();
      const task = await create(user, { title: 'a', priority: 'low' });
      await send('post', user, `/api/tasks/${task.id}/items`, { title: 'p' });

      const res = await complete(user, task.id);

      expect(res.body.xpAwarded).toBe(10);
      expect(res.body.task.items).toHaveLength(1);
    });
  });

  describe('teto diário de XP de tarefas', () => {
    const highs = async (user: TestUser, count: number) => {
      const ids: string[] = [];
      for (let index = 0; index < count; index += 1) {
        ids.push((await create(user, { title: `alta ${index}`, priority: 'high' })).id);
      }
      return ids;
    };

    it(`credita só o que cabe em ${TASK_DAILY_XP_CAP} XP por dia e depois conclui sem XP`, async () => {
      const { user } = await setup();
      const [a, b, c, d] = await highs(user, 4);

      const results = [];
      for (const id of [a!, b!, c!, d!]) results.push((await complete(user, id)).body);

      expect(results.map((r) => [r.xpAwarded, r.capped])).toEqual([
        [40, false],
        [40, false],
        [20, true],
        [0, true],
      ]);
      // a quarta foi concluída mesmo assim, só não rendeu XP
      expect(results[3].task.completedAt).toBe(NOON);
      expect(results[3].task.xpAwarded).toBe(0);
      const ledger = await ledgerOf(user.userId);
      expect(ledger.map((entry) => entry.amount)).toEqual([40, 40, 20]);
      expect(results[3].total.xp).toBe(100);
      expect((await list(user)).xpToday).toBe(100);
    });

    it('desfazer libera espaço no teto', async () => {
      const { user } = await setup();
      const [a, b, c, d] = await highs(user, 4);
      for (const id of [a!, b!, c!]) await complete(user, id); // 40 + 40 + 20 = 100
      expect((await complete(user, d!)).body.xpAwarded).toBe(0);
      await undo(user, d!); // a quarta rendeu 0: nada a estornar

      await undo(user, a!); // devolve 40
      const again = await complete(user, d!);

      expect(again.body).toMatchObject({ xpAwarded: 40, capped: false });
      expect((await list(user)).xpToday).toBe(100);
    });

    it('o teto zera no dia seguinte (dia local)', async () => {
      const { user } = await setup();
      const [a, b, c, d] = await highs(user, 4);
      for (const id of [a!, b!, c!]) await complete(user, id);

      clock.set(NEXT_DAY_NOON);
      const res = await complete(user, d!);

      expect(res.body).toMatchObject({ xpAwarded: 40, capped: false });
    });

    it('a virada do dia é a do fuso da pessoa, não a do servidor', async () => {
      // Kiribati (UTC+14): 2026-10-07 10:30Z = dia 7 às 24:30 local? não: 10:30Z = 00:30 do dia 8.
      const { user } = await setup('Pacific/Kiritimati');
      const [a, b, c, d] = await highs(user, 4);
      clock.set('2026-10-07T09:30:00.000Z'); // 23:30 do dia 7, em Kiribati
      for (const id of [a!, b!, c!]) await complete(user, id);

      clock.set('2026-10-07T10:30:00.000Z'); // 00:30 do dia 8, em Kiribati: dia novo, teto novo
      const res = await complete(user, d!);

      expect(res.body.xpAwarded).toBe(40);
    });

    it('só XP de tarefas conta para o teto: o XP de blocos do mesmo dia não o consome', async () => {
      const { user } = await setup();
      await prisma.xpTransaction.create({
        data: { userId: user.userId, type: 'COMPLETION', amount: 250, createdAt: new Date(NOON) },
      });
      await prisma.user.update({ where: { id: user.userId }, data: { cachedTotalXp: 250 } });
      const [a, b, c] = await highs(user, 3);

      const gained = [];
      for (const id of [a!, b!, c!]) gained.push((await complete(user, id)).body.xpAwarded);

      expect(gained).toEqual([40, 40, 20]);
      expect((await list(user)).xpToday).toBe(TASK_DAILY_XP_CAP);
    });

    it('o teto é de cada pessoa: o XP de tarefas de outra não consome o meu', async () => {
      const mine = await setup();
      const other = await setup();
      for (const id of await highs(other.user, 3)) await complete(other.user, id);
      const [first] = await highs(mine.user, 1);

      const res = await complete(mine.user, first!);

      expect(res.body).toMatchObject({ xpAwarded: 40, capped: false });
      expect((await list(mine.user)).xpToday).toBe(40);
    });

    it('conclusões simultâneas nunca passam do teto (a pessoa é travada)', async () => {
      const { user } = await setup();
      const ids = await highs(user, 6);

      const results = await Promise.all(ids.map((id) => complete(user, id)));

      expect(results.every((res) => res.status === 200)).toBe(true);
      const total = results.reduce((sum, res) => sum + res.body.xpAwarded, 0);
      expect(total).toBe(TASK_DAILY_XP_CAP);
      const ledger = await ledgerOf(user.userId);
      expect(ledger.reduce((sum, entry) => sum + entry.amount, 0)).toBe(TASK_DAILY_XP_CAP);
    });

    it('concluir a MESMA tarefa várias vezes ao mesmo tempo credita uma vez só', async () => {
      const { user } = await setup();
      const task = await create(user, { title: 'a', priority: 'high' });

      const results = await Promise.all(Array.from({ length: 5 }, () => complete(user, task.id)));

      expect(results.every((res) => res.status === 200)).toBe(true);
      expect(results.filter((res) => !res.body.alreadyCompleted)).toHaveLength(1);
      expect(await ledgerOf(user.userId)).toHaveLength(1);
    });
  });

  describe('desfazer (DELETE /tasks/:id/complete)', () => {
    it('estorna o XP (lançamento negativo ligado ao original) e reabre a tarefa', async () => {
      const { user, areaId } = await setup();
      const task = await create(user, { title: 'a', priority: 'high', areaId });
      await complete(user, task.id);

      const res = await undo(user, task.id);

      expect(res.status).toBe(200);
      expect(taskUndoResultSchema.safeParse(res.body).success).toBe(true);
      expect(res.body).toMatchObject({ xpReverted: 40 });
      expect(res.body.task).toMatchObject({ completedAt: null, xpAwarded: 0 });
      expect(res.body.total.xp).toBe(0);
      expect(res.body.area).toMatchObject({ areaId, xp: 0 });
      const ledger = await ledgerOf(user.userId);
      expect(ledger.map((entry) => [entry.type, entry.amount])).toEqual([
        ['TASK', 40],
        ['REVERSAL', -40],
      ]);
      expect(ledger[1]!.reversedTransactionId).toBe(ledger[0]!.id);
    });

    it('é idempotente: desfazer de novo, ou uma tarefa em aberto, não faz nada', async () => {
      const { user } = await setup();
      const done = await create(user, { title: 'a', priority: 'high' });
      const open = await create(user, { title: 'b' });
      await complete(user, done.id);
      await undo(user, done.id);

      const again = await undo(user, done.id);
      const untouched = await undo(user, open.id);

      expect(again.body.xpReverted).toBe(0);
      expect(untouched.body.xpReverted).toBe(0);
      expect(await ledgerOf(user.userId)).toHaveLength(2);
    });

    it('dá para desfazer num dia posterior, e o estorno vai para o dia do estorno', async () => {
      const { user } = await setup();
      const task = await create(user, { title: 'a', priority: 'high' });
      await complete(user, task.id);

      clock.set(NEXT_DAY_NOON);
      const res = await undo(user, task.id);

      expect(res.body.xpReverted).toBe(40);
      expect((await ledgerOf(user.userId))[1]!.createdAt.toISOString()).toBe(NEXT_DAY_NOON);
    });

    it('depois de desfazer, concluir de novo credita de novo (novo lançamento)', async () => {
      const { user } = await setup();
      const task = await create(user, { title: 'a', priority: 'medium' });
      await complete(user, task.id);
      await undo(user, task.id);

      const res = await complete(user, task.id);

      expect(res.body).toMatchObject({ alreadyCompleted: false, xpAwarded: 20 });
      expect((await ledgerOf(user.userId)).map((entry) => entry.amount)).toEqual([20, -20, 20]);
      expect(res.body.total.xp).toBe(20);
    });

    it('estorna na área em que o XP foi ganho, mesmo que a tarefa mude de área depois', async () => {
      const { user, areaId, otherAreaId } = await setup();
      const task = await create(user, { title: 'a', priority: 'high', areaId });
      await complete(user, task.id);
      await send('patch', user, `/api/tasks/${task.id}`, { areaId: otherAreaId });

      const res = await undo(user, task.id);

      expect(res.body.xpReverted).toBe(40);
      const progress = await prisma.areaProgress.findMany({ where: { userId: user.userId } });
      expect(progress.every((row) => row.cachedXp === 0)).toBe(true);
    });

    it('tarefa de outra pessoa responde 404 e não estorna nada', async () => {
      const mine = await setup();
      const other = await setup();
      const theirs = await create(other.user, { title: 'dela', priority: 'high' });
      await complete(other.user, theirs.id);

      expect((await undo(mine.user, theirs.id)).status).toBe(404);
      expect(await ledgerOf(other.user.userId)).toHaveLength(1);
    });
  });

  describe('passos do checklist', () => {
    const addItem = (user: TestUser, id: string, title: string) =>
      send('post', user, `/api/tasks/${id}/items`, { title });

    it('adiciona passos em ordem e devolve a tarefa inteira', async () => {
      const { user } = await setup();
      const task = await create(user, { title: 'Viagem' });

      const first = await addItem(user, task.id, '  malas  ');
      const second = await addItem(user, task.id, 'passagens');

      expect(first.status).toBe(201);
      expect(taskSchema.safeParse(second.body).success).toBe(true);
      expect(
        second.body.items.map((i: { title: string; position: number; done: boolean }) => [
          i.title,
          i.position,
          i.done,
        ]),
      ).toEqual([
        ['malas', 0, false],
        ['passagens', 1, false],
      ]);
    });

    it('recusa passo vazio, longo demais ou com campo desconhecido', async () => {
      const { user } = await setup();
      const task = await create(user, { title: 'a' });
      for (const body of [
        {},
        { title: ' ' },
        { title: 'a'.repeat(121) },
        { title: 'x', done: true },
      ]) {
        expect([
          JSON.stringify(body),
          (await send('post', user, `/api/tasks/${task.id}/items`, body)).status,
        ]).toEqual([JSON.stringify(body), 400]);
      }
      expect((await addItem(user, task.id, 'a'.repeat(120))).status).toBe(201);
    });

    it(`no máximo ${MAX_TASK_ITEMS} passos (409), mesmo com pedidos simultâneos`, async () => {
      const { user } = await setup();
      const task = await create(user, { title: 'a' });
      for (let index = 0; index < MAX_TASK_ITEMS - 2; index += 1) {
        expect((await addItem(user, task.id, `p${index}`)).status).toBe(201);
      }

      const results = await Promise.all(
        Array.from({ length: 5 }, (_, index) => addItem(user, task.id, `extra ${index}`)),
      );

      expect(results.filter((res) => res.status === 201)).toHaveLength(2);
      expect(results.filter((res) => res.status === 409)).toHaveLength(3);
      expect(await prisma.taskItem.count({ where: { taskId: task.id } })).toBe(MAX_TASK_ITEMS);
    });

    it('marca e desmarca; marcar de novo mantém o instante original', async () => {
      const { user } = await setup();
      const task = await create(user, { title: 'a' });
      const itemId = (await addItem(user, task.id, 'p')).body.items[0].id;
      const patch = (body: object) =>
        send('patch', user, `/api/tasks/${task.id}/items/${itemId}`, body);

      clock.set(NOON);
      const marked = (await patch({ done: true })).body.items[0];
      expect(marked).toMatchObject({ done: true, doneAt: NOON });

      clock.set(NEXT_DAY_NOON);
      expect((await patch({ done: true })).body.items[0].doneAt).toBe(NOON);
      expect((await patch({ done: false })).body.items[0]).toMatchObject({
        done: false,
        doneAt: null,
      });
    });

    it('renomeia o passo, e recusa corpo vazio', async () => {
      const { user } = await setup();
      const task = await create(user, { title: 'a' });
      const itemId = (await addItem(user, task.id, 'p')).body.items[0].id;
      const url = `/api/tasks/${task.id}/items/${itemId}`;

      expect((await send('patch', user, url, { title: ' novo ' })).body.items[0].title).toBe(
        'novo',
      );
      expect((await send('patch', user, url, {})).status).toBe(400);
    });

    it('remove o passo; remover de novo ou um inexistente é 404', async () => {
      const { user } = await setup();
      const task = await create(user, { title: 'a' });
      await addItem(user, task.id, 'um');
      const body = (await addItem(user, task.id, 'dois')).body;
      const [one, two] = body.items;

      const removed = await send('delete', user, `/api/tasks/${task.id}/items/${one.id}`);

      expect(removed.status).toBe(200);
      expect(removed.body.items.map((i: { id: string }) => i.id)).toEqual([two.id]);
      expect((await send('delete', user, `/api/tasks/${task.id}/items/${one.id}`)).status).toBe(
        404,
      );
    });

    it('depois de remover, o próximo passo não repete uma posição existente', async () => {
      const { user } = await setup();
      const task = await create(user, { title: 'a' });
      await addItem(user, task.id, 'um');
      const two = (await addItem(user, task.id, 'dois')).body.items[1];
      await addItem(user, task.id, 'três');
      await send('delete', user, `/api/tasks/${task.id}/items/${two.id}`);

      const res = await addItem(user, task.id, 'quatro');

      const positions = res.body.items.map((i: { position: number }) => i.position);
      expect(new Set(positions).size).toBe(positions.length);
      expect(res.body.items.map((i: { title: string }) => i.title)).toEqual([
        'um',
        'três',
        'quatro',
      ]);
    });

    it('passo de outra tarefa, ou tarefa de outra pessoa: 404 e nada muda', async () => {
      const mine = await setup();
      const other = await setup();
      const a = await create(mine.user, { title: 'a' });
      const b = await create(mine.user, { title: 'b' });
      const theirs = await create(other.user, { title: 'dela' });
      const bItem = (await addItem(mine.user, b.id, 'p')).body.items[0];
      const theirItem = (await addItem(other.user, theirs.id, 'p')).body.items[0];

      expect(
        (await send('patch', mine.user, `/api/tasks/${a.id}/items/${bItem.id}`, { done: true }))
          .status,
      ).toBe(404);
      expect((await send('delete', mine.user, `/api/tasks/${a.id}/items/${bItem.id}`)).status).toBe(
        404,
      );
      expect((await addItem(mine.user, theirs.id, 'x')).status).toBe(404);
      expect(
        (
          await send('patch', mine.user, `/api/tasks/${theirs.id}/items/${theirItem.id}`, {
            done: true,
          })
        ).status,
      ).toBe(404);
      expect(
        (await prisma.taskItem.findUniqueOrThrow({ where: { id: theirItem.id } })).doneAt,
      ).toBeNull();
      expect(
        (await prisma.taskItem.findUniqueOrThrow({ where: { id: bItem.id } })).doneAt,
      ).toBeNull();
    });
  });

  describe('histórico de XP', () => {
    it('mostra a conclusão e o estorno com o nome da tarefa', async () => {
      const { user, areaId } = await setup();
      const task = await create(user, { title: 'Pagar a conta de luz', priority: 'high', areaId });
      await complete(user, task.id);
      await undo(user, task.id);

      const res = await send('get', user, '/api/xp/history');

      expect(res.status).toBe(200);
      expect(
        res.body.items.map((item: Record<string, unknown>) => [
          item['type'],
          item['amount'],
          item['reversedType'],
          item['sourceLabel'],
        ]),
      ).toEqual([
        ['reversal', -40, 'task', 'Pagar a conta de luz'],
        ['task', 40, null, 'Pagar a conta de luz'],
      ]);
    });

    it('filtra por tipo de tarefa', async () => {
      const { user } = await setup();
      const task = await create(user, { title: 'a', priority: 'low' });
      await complete(user, task.id);

      const res = await send('get', user, '/api/xp/history?type=task');

      expect(res.body.items).toHaveLength(1);
    });
  });
});
