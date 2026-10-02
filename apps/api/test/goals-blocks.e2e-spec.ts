import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { goalHistoryItemSchema, goalSchema } from '@lifexp/shared';
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

const NOON = '2026-10-07T15:00:00.000Z'; // quarta 12:00 em São Paulo

describe('Blocos vinculados a metas e horas investidas (e2e)', () => {
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
    const [activity, other] = await listActivities(app, user);
    return { user, activity: activity!, other: other! };
  };
  const send = (
    method: 'post' | 'put' | 'delete' | 'get' | 'patch',
    user: TestUser,
    path: string,
    body?: object,
  ) => {
    const req = request(server())[method](path).set(bearer(user));
    return body ? req.send(body) : req;
  };
  const newGoal = async (user: TestUser, body: object = {}) =>
    goalSchema.parse((await send('post', user, '/api/goals', { title: 'Meta', ...body })).body);
  const getGoal = async (user: TestUser, id: string) =>
    goalSchema.parse((await send('get', user, `/api/goals/${id}`)).body);
  const onceBlock = (user: TestUser, activityId: string, body: object = {}) =>
    send('post', user, '/api/blocks', {
      recurrence: 'once',
      activityId,
      date: '2026-10-07',
      startTime: '09:00',
      durationMin: 60,
      ...body,
    });
  const weeklyBlock = (user: TestUser, activityId: string, body: object = {}) =>
    send('post', user, '/api/blocks', {
      recurrence: 'weekly',
      activityId,
      weekday: 3,
      startTime: '09:00',
      durationMin: 60,
      validFrom: '2026-09-23',
      ...body,
    });
  const complete = (user: TestUser, blockId: string, date = '2026-10-07') =>
    send('post', user, `/api/blocks/${blockId}/occurrences/${date}/completion`);
  const undo = (user: TestUser, blockId: string, date = '2026-10-07') =>
    send('delete', user, `/api/blocks/${blockId}/occurrences/${date}/completion`);
  const history = async (user: TestUser, goalId: string, query = '') => {
    const res = await send('get', user, `/api/goals/${goalId}/history${query}`);
    expect(res.status).toBe(200);
    return (res.body as unknown[]).map((item) => goalHistoryItemSchema.parse(item));
  };

  describe('vincular bloco a meta (RF19)', () => {
    it('cria bloco avulso e semanal já ligados à meta; sem meta, goalId é nulo', async () => {
      const { user, activity } = await setup();
      const goal = await newGoal(user);

      const once = await onceBlock(user, activity.id, { goalId: goal.id });
      const weekly = await weeklyBlock(user, activity.id, { goalId: goal.id });
      const plain = await onceBlock(user, activity.id);

      expect([once.status, weekly.status, plain.status]).toEqual([201, 201, 201]);
      expect(once.body.goalId).toBe(goal.id);
      expect(weekly.body.goalId).toBe(goal.id);
      expect(plain.body.goalId).toBeNull();
    });

    it('meta de outra pessoa ou inexistente responde 404 (RS06) e o bloco não é criado', async () => {
      const [ana, bia] = [await setup(), await setup()];
      const foreign = await newGoal(bia.user);

      const res = await onceBlock(ana.user, ana.activity.id, { goalId: foreign.id });
      expect(res.status).toBe(404);
      expect(
        (
          await onceBlock(ana.user, ana.activity.id, {
            goalId: '0192f1a0-7b3c-7000-8000-0000000000ff',
          })
        ).status,
      ).toBe(404);
      expect(await prisma.block.count({ where: { userId: ana.user.userId } })).toBe(0);
    });

    it('meta concluída ou abandonada não recebe blocos novos (409); pausada recebe', async () => {
      const { user, activity } = await setup();
      const goal = await newGoal(user);

      await send('put', user, `/api/goals/${goal.id}/status`, { status: 'paused' });
      expect((await onceBlock(user, activity.id, { goalId: goal.id })).status).toBe(201);

      for (const status of ['completed', 'abandoned']) {
        await send('put', user, `/api/goals/${goal.id}/status`, { status });
        const res = await onceBlock(user, activity.id, { goalId: goal.id });
        expect(res.status).toBe(409);
        expect(res.body.message).toMatch(/Reabra a meta/);
      }
    });

    it('rejeita goalId que não é uuid', async () => {
      const { user, activity } = await setup();
      expect((await onceBlock(user, activity.id, { goalId: 'abc' })).status).toBe(400);
    });

    it('vincula, troca e desvincula editando o bloco (só goalId já conta como mudança)', async () => {
      const { user, activity } = await setup();
      const [a, b] = [await newGoal(user, { title: 'A' }), await newGoal(user, { title: 'B' })];
      const block = (await onceBlock(user, activity.id)).body;
      const edit = (goalId: string | null) =>
        send('patch', user, `/api/blocks/${block.id}`, { from: '2026-10-07', goalId });

      expect((await edit(a.id)).body.goalId).toBe(a.id);
      expect((await edit(b.id)).body.goalId).toBe(b.id);
      const cleared = await edit(null);
      expect(cleared.status).toBe(200);
      expect(cleared.body.goalId).toBeNull();
    });

    it('editar outros campos mantém o vínculo', async () => {
      const { user, activity } = await setup();
      const goal = await newGoal(user);
      const block = (await onceBlock(user, activity.id, { goalId: goal.id })).body;

      const res = await send('patch', user, `/api/blocks/${block.id}`, {
        from: '2026-10-07',
        startTime: '10:00',
      });

      expect(res.body).toMatchObject({ startTime: '10:00', goalId: goal.id });
    });

    it('vincular a meta alheia ao editar é 404 e o bloco continua como estava', async () => {
      const [ana, bia] = [await setup(), await setup()];
      const foreign = await newGoal(bia.user);
      const block = (await onceBlock(ana.user, ana.activity.id)).body;

      const res = await send('patch', ana.user, `/api/blocks/${block.id}`, {
        from: '2026-10-07',
        goalId: foreign.id,
      });

      expect(res.status).toBe(404);
      expect((await prisma.block.findUniqueOrThrow({ where: { id: block.id } })).goalId).toBeNull();
    });

    it('ao dividir a série, o bloco novo herda a meta; mudar a meta vale só daqui em diante', async () => {
      const { user, activity } = await setup();
      const [a, b] = [await newGoal(user, { title: 'A' }), await newGoal(user, { title: 'B' })];
      const block = (await weeklyBlock(user, activity.id, { goalId: a.id })).body;

      // muda só o horário a partir de 14/10: série nova, mesma meta
      const split = await send('patch', user, `/api/blocks/${block.id}`, {
        from: '2026-10-14',
        startTime: '10:00',
      });
      expect(split.body.id).not.toBe(block.id);
      expect(split.body.goalId).toBe(a.id);

      // troca a meta a partir de 21/10: a série de 14/10 fecha, a nova segue com a meta B
      const relinked = await send('patch', user, `/api/blocks/${split.body.id}`, {
        from: '2026-10-21',
        goalId: b.id,
      });
      expect(relinked.body.goalId).toBe(b.id);
      expect((await prisma.block.findUniqueOrThrow({ where: { id: block.id } })).goalId).toBe(a.id);
      expect((await prisma.block.findUniqueOrThrow({ where: { id: split.body.id } })).goalId).toBe(
        a.id,
      );
    });
  });

  describe('horas investidas e histórico (RN35, RF32, RF54)', () => {
    it('soma só as conclusões ativas dos blocos ligados à meta', async () => {
      const { user, activity, other } = await setup();
      const goal = await newGoal(user);
      const linked = (await onceBlock(user, activity.id, { goalId: goal.id })).body;
      const unlinked = (await onceBlock(user, other.id, { startTime: '10:00' })).body;

      await complete(user, linked.id);
      await complete(user, unlinked.id);

      expect((await getGoal(user, goal.id)).investedMinutes).toBe(60);
    });

    it('soma várias ocorrências e usa a duração da conclusão (a "foto"), não a atual do bloco', async () => {
      const { user, activity } = await setup();
      const goal = await newGoal(user);
      const block = (await weeklyBlock(user, activity.id, { goalId: goal.id })).body;
      // a ocorrência de 30/09 foi alterada para 90 min; a de 07/10 segue com 60 min
      await send('put', user, `/api/blocks/${block.id}/exceptions/2026-09-30`, {
        type: 'override',
        newDurationMin: 90,
      });
      clock.set('2026-09-30T15:00:00.000Z');
      await complete(user, block.id, '2026-09-30');
      clock.set(NOON);
      await complete(user, block.id, '2026-10-07');

      expect((await getGoal(user, goal.id)).investedMinutes).toBe(150);
    });

    it('desfazer a conclusão tira os minutos; concluir de novo devolve', async () => {
      const { user, activity } = await setup();
      const goal = await newGoal(user);
      const block = (await onceBlock(user, activity.id, { goalId: goal.id })).body;

      await complete(user, block.id);
      expect((await getGoal(user, goal.id)).investedMinutes).toBe(60);
      await undo(user, block.id);
      expect((await getGoal(user, goal.id)).investedMinutes).toBe(0);
      await complete(user, block.id);
      expect((await getGoal(user, goal.id)).investedMinutes).toBe(60);
    });

    it('os minutos aparecem em cada meta da lista, sem misturar', async () => {
      const { user, activity } = await setup();
      const [a, b] = [await newGoal(user, { title: 'A' }), await newGoal(user, { title: 'B' })];
      const blockA = (await onceBlock(user, activity.id, { goalId: a.id })).body;
      const blockB = (
        await onceBlock(user, activity.id, { goalId: b.id, startTime: '10:00', durationMin: 30 })
      ).body;
      await complete(user, blockA.id);
      await complete(user, blockB.id);

      const list = await send('get', user, '/api/goals');
      const minutes = Object.fromEntries(
        list.body.map((g: { title: string; investedMinutes: number }) => [
          g.title,
          g.investedMinutes,
        ]),
      );
      expect(minutes).toEqual({ A: 60, B: 30 });
    });

    it('o histórico lista os blocos cumpridos, do mais recente ao mais antigo, com a atividade', async () => {
      const { user, activity, other } = await setup();
      const goal = await newGoal(user);
      const first = (await onceBlock(user, activity.id, { goalId: goal.id })).body;
      const second = (
        await onceBlock(user, other.id, { goalId: goal.id, startTime: '10:30', durationMin: 45 })
      ).body;
      await complete(user, first.id);
      clock.set('2026-10-07T16:00:00.000Z');
      await complete(user, second.id);

      const items = await history(user, goal.id);

      expect(items.map((i) => [i.blockId, i.durationMin, i.activityName])).toEqual([
        [second.id, 45, other.name],
        [first.id, 60, activity.name],
      ]);
      expect(items[0]).toMatchObject({
        occurrenceDate: '2026-10-07',
        completedAt: '2026-10-07T16:00:00.000Z',
      });
      expect(items[0]!.xpAmount).toBeGreaterThan(0);
    });

    it('o histórico não traz conclusões desfeitas, de blocos sem meta, nem de outras metas', async () => {
      const { user, activity } = await setup();
      const [goal, otherGoal] = [await newGoal(user), await newGoal(user, { title: 'Outra' })];
      const kept = (await onceBlock(user, activity.id, { goalId: goal.id })).body;
      const undone = (await onceBlock(user, activity.id, { goalId: goal.id, startTime: '11:00' }))
        .body;
      const elsewhere = (
        await onceBlock(user, activity.id, { goalId: otherGoal.id, startTime: '13:00' })
      ).body;
      const loose = (await onceBlock(user, activity.id, { startTime: '15:00' })).body;
      for (const block of [kept, undone, elsewhere, loose]) await complete(user, block.id);
      await undo(user, undone.id);

      expect((await history(user, goal.id)).map((i) => i.blockId)).toEqual([kept.id]);
    });

    it('respeita o limite e valida o parâmetro', async () => {
      const { user, activity } = await setup();
      const goal = await newGoal(user);
      for (const [index, startTime] of ['08:00', '09:30', '11:00'].entries()) {
        const block = (await onceBlock(user, activity.id, { goalId: goal.id, startTime })).body;
        clock.set(`2026-10-07T${String(14 + index).padStart(2, '0')}:00:00.000Z`);
        await complete(user, block.id);
      }

      expect(await history(user, goal.id, '?limit=2')).toHaveLength(2);
      expect(await history(user, goal.id)).toHaveLength(3);
      for (const bad of ['0', '201', 'abc']) {
        expect((await send('get', user, `/api/goals/${goal.id}/history?limit=${bad}`)).status).toBe(
          400,
        );
      }
    });

    it('histórico de meta alheia é 404 e exige login', async () => {
      const [ana, bia] = [await setup(), await setup()];
      const goal = await newGoal(ana.user);

      expect((await send('get', bia.user, `/api/goals/${goal.id}/history`)).status).toBe(404);
      expect((await request(server()).get(`/api/goals/${goal.id}/history`)).status).toBe(401);
    });

    it('conclusões de outra pessoa nunca entram na meta', async () => {
      const [ana, bia] = [await setup(), await setup()];
      const goal = await newGoal(ana.user);
      const block = (await onceBlock(bia.user, bia.activity.id)).body;
      await complete(bia.user, block.id);
      // mesmo que alguém forçasse o vínculo no banco, a soma filtra pela pessoa
      await prisma.block.update({ where: { id: block.id }, data: { goalId: goal.id } });

      expect((await getGoal(ana.user, goal.id)).investedMinutes).toBe(0);
      expect(await history(ana.user, goal.id)).toEqual([]);
    });
  });

  describe('concorrência entre vincular bloco e excluir meta', () => {
    /**
     * Determinístico: uma transação externa exclui a meta e fica aberta; a chamada de vínculo tem
     * que ESPERAR por ela (a meta está travada) e, depois do commit, responder 404 em vez de gravar
     * um vínculo para uma meta que não existe mais (o que viraria erro 500 por chave estrangeira).
     */
    const withGoalDeletionInFlight = async (
      goalId: string,
      during: () => Promise<request.Response>,
    ) => {
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      let started!: () => void;
      const deleting = new Promise<void>((resolve) => (started = resolve));
      const outer = prisma.$transaction(
        async (tx) => {
          await tx.goal.delete({ where: { id: goalId } });
          started();
          await held;
        },
        { timeout: 20_000 },
      );
      await deleting;
      const pending = during();
      await new Promise((resolve) => setTimeout(resolve, 400));
      release();
      await outer;
      return pending;
    };

    it('criar bloco ligado a uma meta que está sendo excluída espera e responde 404', async () => {
      const { user, activity } = await setup();
      const goal = await newGoal(user);

      const res = await withGoalDeletionInFlight(goal.id, () =>
        onceBlock(user, activity.id, { goalId: goal.id }),
      );

      expect(res.status).toBe(404);
      expect(await prisma.block.count({ where: { userId: user.userId } })).toBe(0);
    });

    it('vincular um bloco existente a uma meta que está sendo excluída espera e responde 404', async () => {
      const { user, activity } = await setup();
      const goal = await newGoal(user);
      const block = (await onceBlock(user, activity.id)).body;

      const res = await withGoalDeletionInFlight(goal.id, () =>
        send('patch', user, `/api/blocks/${block.id}`, { from: '2026-10-07', goalId: goal.id }),
      );

      expect(res.status).toBe(404);
      expect((await prisma.block.findUniqueOrThrow({ where: { id: block.id } })).goalId).toBeNull();
    });

    it('vários vínculos de bloco em paralelo com a exclusão da meta nunca dão erro 500 (sem deadlock)', async () => {
      const { user, activity } = await setup();

      for (let round = 0; round < 25; round += 1) {
        const goal = await newGoal(user, { title: `Disputa ${round}` });
        const blocks = await Promise.all(
          [0, 1, 2].map(async (i) => {
            const res = await onceBlock(user, activity.id, {
              date: `2026-11-${String(1 + round).padStart(2, '0')}`,
              startTime: `0${6 + i}:00`,
              goalId: round % 2 === 0 ? goal.id : undefined,
            });
            return res.body.id as string;
          }),
        );

        const results = await Promise.all([
          ...blocks.map((id) =>
            send('patch', user, `/api/blocks/${id}`, { from: '2026-11-01', goalId: goal.id }),
          ),
          send('delete', user, `/api/goals/${goal.id}`),
        ]);

        for (const res of results) expect([200, 201, 204, 404]).toContain(res.status);
      }
    });

    it('nunca dá erro 500: ou o bloco nasce (e perde a meta), ou responde 404', async () => {
      const { user, activity } = await setup();

      for (let round = 0; round < 6; round += 1) {
        const goal = await newGoal(user, { title: `Corrida ${round}` });
        const [created, deleted] = await Promise.all([
          onceBlock(user, activity.id, { goalId: goal.id, date: `2026-10-${10 + round}` }),
          send('delete', user, `/api/goals/${goal.id}`),
        ]);

        expect(deleted.status).toBe(204);
        expect([201, 404]).toContain(created.status);
        if (created.status === 201) {
          // a meta não existe mais: o bloco ficou, sem vínculo
          const row = await prisma.block.findUniqueOrThrow({ where: { id: created.body.id } });
          expect(row.goalId).toBeNull();
        }
      }
    });
  });
});
