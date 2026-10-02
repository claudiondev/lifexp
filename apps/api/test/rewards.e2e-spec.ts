import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MAX_REWARDS, completionResultSchema, rewardSchema, xpToReachLevel } from '@lifexp/shared';
import { PrismaService } from '../src/prisma/prisma.service.js';
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

describe('Recompensas reais (e2e, RF25)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const clock = new FakeClock(noon(WED));
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp({ clock });
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => clock.set(noon(WED)));

  const setup = async () => {
    const user = await registerUser(app);
    const activities = await listActivities(app, user);
    return { user, activity: activities[0]! };
  };
  const send = (
    method: 'post' | 'patch' | 'delete' | 'get',
    user: TestUser,
    url: string,
    body?: object,
  ) => {
    const call = request(server())[method](url).set(bearer(user));
    return body ? call.send(body) : call;
  };
  const createReward = async (user: TestUser, trigger: object, title = 'Jantar fora') => {
    const res = await send('post', user, '/api/rewards', { title, trigger });
    expect(res.status).toBe(201);
    return rewardSchema.parse(res.body);
  };
  const rewardOf = async (user: TestUser, id: string) => {
    const res = await send('get', user, '/api/rewards');
    return (res.body as { id: string }[])
      .map((r) => rewardSchema.parse(r))
      .find((r) => r.id === id)!;
  };
  const onceBlock = async (user: TestUser, activityId: string, date: string, durationMin = 60) => {
    const res = await send('post', user, '/api/blocks', {
      recurrence: 'once',
      activityId,
      date,
      startTime: '09:00',
      durationMin,
    });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  };
  const completeOn = async (user: TestUser, blockId: string, date: string) => {
    clock.set(noon(date));
    const res = await send('post', user, `/api/blocks/${blockId}/occurrences/${date}/completion`);
    expect(res.status).toBe(200);
    clock.set(noon(WED));
    return completionResultSchema.parse(res.body);
  };

  describe('cadastro', () => {
    it('cria com cada tipo de gatilho, começando bloqueada', async () => {
      const { user } = await setup();
      for (const trigger of [
        { type: 'level', threshold: 5 },
        { type: 'streak', threshold: 7 },
        { type: 'total_xp', threshold: 5000 },
        { type: 'achievement', achievementKey: 'constant' },
      ]) {
        const reward = await createReward(user, trigger);
        expect(reward).toMatchObject({
          title: 'Jantar fora',
          description: null,
          trigger,
          status: 'locked',
          reachedAt: null,
          redeemedAt: null,
        });
      }
    });

    it('lista as mais novas primeiro e só as da própria pessoa', async () => {
      const { user: ana } = await setup();
      const { user: bia } = await setup();
      const first = await createReward(ana, { type: 'level', threshold: 5 }, 'Primeira');
      const second = await createReward(ana, { type: 'level', threshold: 6 }, 'Segunda');
      await createReward(bia, { type: 'level', threshold: 7 }, 'Da Bia');

      const list = (await send('get', ana, '/api/rewards')).body as { id: string }[];
      expect(list.map((r) => r.id)).toEqual([second.id, first.id]);
      expect((await send('get', bia, '/api/rewards')).body).toHaveLength(1);
    });

    it('recusa corpo inválido (400): campo desconhecido, limiar fora da faixa, título vazio, gatilho misturado', async () => {
      const { user } = await setup();
      const bad = [
        { title: 'x', trigger: { type: 'level', threshold: 1 } },
        { title: 'x', trigger: { type: 'streak', threshold: 400 } },
        { title: '  ', trigger: { type: 'level', threshold: 5 } },
        { title: 'x', trigger: { type: 'level', threshold: 5, achievementKey: 'constant' } },
        { title: 'x', trigger: { type: 'achievement', achievementKey: 'inventada' } },
        {
          title: 'x',
          trigger: { type: 'level', threshold: 5 },
          redeemedAt: '2026-10-07T12:00:00.000Z',
        },
        { title: 'x' },
      ];
      for (const body of bad) {
        expect((await send('post', user, '/api/rewards', body)).status).toBe(400);
      }
    });

    it(`limite de ${MAX_REWARDS}: a 51ª dá 409, mesmo com pedidos simultâneos`, async () => {
      const { user } = await setup();
      await prisma.reward.createMany({
        data: Array.from({ length: MAX_REWARDS - 3 }, (_, i) => ({
          userId: user.userId,
          title: `R${i}`,
          trigger: 'LEVEL' as const,
          threshold: 5,
        })),
      });
      const statuses = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          send('post', user, '/api/rewards', {
            title: `Nova ${i}`,
            trigger: { type: 'level', threshold: 6 },
          }).then((res) => res.status),
        ),
      );
      expect(statuses.filter((s) => s === 201)).toHaveLength(3);
      expect(statuses.filter((s) => s === 409)).toHaveLength(3);
      expect(await prisma.reward.count({ where: { userId: user.userId } })).toBe(MAX_REWARDS);
    });

    it('um gatilho que a pessoa já atingiu nasce desbloqueado', async () => {
      const { user, activity } = await setup();
      const block = await onceBlock(user, activity.id, MON);
      await completeOn(user, block.id, MON); // first_step + XP

      const byAchievement = await createReward(user, {
        type: 'achievement',
        achievementKey: 'first_step',
      });
      const byXp = await createReward(user, { type: 'total_xp', threshold: 1 });
      const notYet = await createReward(user, { type: 'achievement', achievementKey: 'constant' });
      expect(byAchievement.status).toBe('available');
      expect(byAchievement.reachedAt).toBe(noon(WED));
      expect(byXp.status).toBe('available');
      expect(notYet.status).toBe('locked');
    });
  });

  describe('edição e exclusão', () => {
    it('muda título e descrição, nunca o gatilho', async () => {
      const { user } = await setup();
      const reward = await createReward(user, { type: 'level', threshold: 5 });

      const edited = await send('patch', user, `/api/rewards/${reward.id}`, {
        title: 'Jantar no japonês',
        description: 'Com a família',
      });
      expect(edited.status).toBe(200);
      expect(edited.body).toMatchObject({
        title: 'Jantar no japonês',
        description: 'Com a família',
        trigger: { type: 'level', threshold: 5 },
      });
      expect(
        (await send('patch', user, `/api/rewards/${reward.id}`, { description: null })).body
          .description,
      ).toBeNull();

      expect(
        (
          await send('patch', user, `/api/rewards/${reward.id}`, {
            trigger: { type: 'level', threshold: 9 },
          })
        ).status,
      ).toBe(400);
      expect((await send('patch', user, `/api/rewards/${reward.id}`, {})).status).toBe(400);
      expect((await rewardOf(user, reward.id)).trigger).toEqual({ type: 'level', threshold: 5 });
    });

    it('exclui (204) e a segunda vez dá 404', async () => {
      const { user } = await setup();
      const reward = await createReward(user, { type: 'level', threshold: 5 });
      expect((await send('delete', user, `/api/rewards/${reward.id}`)).status).toBe(204);
      expect((await send('delete', user, `/api/rewards/${reward.id}`)).status).toBe(404);
      expect((await send('get', user, '/api/rewards')).body).toEqual([]);
    });

    it('recompensa alheia responde 404 em tudo (editar, resgatar, excluir)', async () => {
      const { user: ana } = await setup();
      const { user: bia } = await setup();
      const reward = await createReward(ana, { type: 'level', threshold: 5 });

      expect((await send('patch', bia, `/api/rewards/${reward.id}`, { title: 'x' })).status).toBe(
        404,
      );
      expect((await send('post', bia, `/api/rewards/${reward.id}/redeem`)).status).toBe(404);
      expect((await send('delete', bia, `/api/rewards/${reward.id}`)).status).toBe(404);
      expect((await rewardOf(ana, reward.id)).title).toBe('Jantar fora');
    });

    it('id que não é UUID dá 400', async () => {
      const { user } = await setup();
      expect((await send('delete', user, '/api/rewards/123')).status).toBe(400);
    });
  });

  describe('gatilhos atingidos na conclusão', () => {
    it('XP total: a conclusão que cruza o limiar desbloqueia e avisa, uma vez só', async () => {
      const { user, activity } = await setup();
      const reward = await createReward(user, { type: 'total_xp', threshold: 1 }, 'Sorvete');
      const a = await onceBlock(user, activity.id, MON);
      const b = await onceBlock(user, activity.id, TUE);

      const first = await completeOn(user, a.id, MON);
      expect(first.rewardsReached).toEqual([{ id: reward.id, title: 'Sorvete' }]);
      const after = await rewardOf(user, reward.id);
      expect(after.status).toBe('available');
      expect(after.reachedAt).toBe(noon(MON));

      expect((await completeOn(user, b.id, TUE)).rewardsReached).toEqual([]);
      expect((await rewardOf(user, reward.id)).reachedAt).toBe(noon(MON));
    });

    it('nível: usa o nível geral depois do XP desta conclusão', async () => {
      const { user, activity } = await setup();
      const reward = await createReward(user, { type: 'level', threshold: 5 });
      // deixa a pessoa a 10 XP do nível 5 e conclui um bloco que passa disso
      await prisma.user.update({
        where: { id: user.userId },
        data: { cachedTotalXp: xpToReachLevel(5) - 10 },
      });
      const block = await onceBlock(user, activity.id, MON, 60);

      const result = await completeOn(user, block.id, MON);
      expect(result.rewardsReached.map((r) => r.id)).toEqual([reward.id]);
    });

    it('conquista como gatilho: desbloqueia junto com a conquista', async () => {
      const { user, activity } = await setup();
      const reward = await createReward(user, {
        type: 'achievement',
        achievementKey: 'first_step',
      });
      const block = await onceBlock(user, activity.id, MON);

      const result = await completeOn(user, block.id, MON);
      expect(result.achievementsUnlocked).toEqual(['first_step']);
      expect(result.rewardsReached.map((r) => r.id)).toEqual([reward.id]);
    });

    it('streak: desbloqueia no dia em que a sequência chega ao limiar e não some se cair depois', async () => {
      const { user, activity } = await setup();
      const reward = await createReward(user, { type: 'streak', threshold: 2 });
      const a = await onceBlock(user, activity.id, MON);
      const b = await onceBlock(user, activity.id, TUE);

      expect((await completeOn(user, a.id, MON)).rewardsReached).toEqual([]);
      expect((await completeOn(user, b.id, TUE)).rewardsReached.map((r) => r.id)).toEqual([
        reward.id,
      ]);

      // desfaz a segunda conclusão: o streak cai, mas o que foi alcançado fica
      clock.set(noon(TUE));
      expect(
        (await send('delete', user, `/api/blocks/${b.id}/occurrences/${TUE}/completion`)).status,
      ).toBe(200);
      expect((await rewardOf(user, reward.id)).status).toBe('available');
    });

    it('streak como gatilho usa o MELHOR streak: criada depois de uma sequência já quebrada, nasce desbloqueada', async () => {
      const { user, activity } = await setup();
      const a = await onceBlock(user, activity.id, '2026-09-28');
      const b = await onceBlock(user, activity.id, '2026-09-29');
      await completeOn(user, a.id, '2026-09-28');
      await completeOn(user, b.id, '2026-09-29');
      // dois dias planejados perdidos (o coringa perdoa só um) quebram a sequência
      await onceBlock(user, activity.id, '2026-09-30');
      await onceBlock(user, activity.id, '2026-10-01');
      clock.set(noon('2026-10-05'));
      const progress = await send('get', user, '/api/progress');
      expect(progress.body.streak).toMatchObject({ current: 0, best: 2 });

      const reward = await createReward(user, { type: 'streak', threshold: 2 });
      expect(reward.status).toBe('available');
    });

    it('desfazer a conclusão não tira o desbloqueio (recompensar, nunca punir)', async () => {
      const { user, activity } = await setup();
      const reward = await createReward(user, { type: 'total_xp', threshold: 1 });
      const block = await onceBlock(user, activity.id, MON);
      await completeOn(user, block.id, MON);
      clock.set(noon(MON));
      await send('delete', user, `/api/blocks/${block.id}/occurrences/${MON}/completion`);

      expect((await rewardOf(user, reward.id)).status).toBe('available');
    });

    it('concluir uma meta (+500 XP) também atinge gatilhos e avisa na resposta da meta', async () => {
      const { user } = await setup();
      const reward = await createReward(user, { type: 'total_xp', threshold: 400 });
      const goal = await send('post', user, '/api/goals', { title: 'Escrever o livro' });
      const done = await request(server())
        .put(`/api/goals/${goal.body.id}/status`)
        .set(bearer(user))
        .send({ status: 'completed' });

      expect(done.status).toBe(200);
      expect(done.body.rewardsReached).toEqual([{ id: reward.id, title: 'Jantar fora' }]);
      expect(done.body.achievementsUnlocked).toEqual(['dream_realized']);
    });

    it('concluir um marco (+100 XP) atinge o gatilho de XP', async () => {
      const { user } = await setup();
      const reward = await createReward(user, { type: 'total_xp', threshold: 100 });
      const goal = await send('post', user, '/api/goals', { title: 'Meta' });
      const milestone = await send('post', user, `/api/goals/${goal.body.id}/milestones`, {
        title: 'Marco 1',
      });
      const mid = milestone.body.milestones[0].id as string;

      const done = await send(
        'post',
        user,
        `/api/goals/${goal.body.id}/milestones/${mid}/completion`,
      );
      expect(done.status).toBe(200);
      expect(done.body.rewardsReached.map((r: { id: string }) => r.id)).toEqual([reward.id]);
    });

    it('recompensas de outra pessoa nunca são tocadas pela conclusão desta', async () => {
      const { user: ana, activity } = await setup();
      const { user: bia } = await setup();
      const hers = await createReward(bia, { type: 'total_xp', threshold: 1 });
      const block = await onceBlock(ana, activity.id, MON);

      expect((await completeOn(ana, block.id, MON)).rewardsReached).toEqual([]);
      expect((await rewardOf(bia, hers.id)).status).toBe('locked');
    });
  });

  describe('resgate', () => {
    it('bloqueada não resgata (409); desbloqueada resgata; resgatar de novo devolve o mesmo resgate', async () => {
      const { user, activity } = await setup();
      const reward = await createReward(user, { type: 'total_xp', threshold: 1 });

      expect((await send('post', user, `/api/rewards/${reward.id}/redeem`)).status).toBe(409);
      expect((await rewardOf(user, reward.id)).status).toBe('locked');

      const block = await onceBlock(user, activity.id, MON);
      await completeOn(user, block.id, MON);

      clock.set(noon(TUE));
      const redeemed = await send('post', user, `/api/rewards/${reward.id}/redeem`);
      expect(redeemed.status).toBe(200);
      expect(redeemed.body).toMatchObject({ status: 'redeemed', redeemedAt: noon(TUE) });

      clock.set(noon(WED));
      const again = await send('post', user, `/api/rewards/${reward.id}/redeem`);
      expect(again.status).toBe(200);
      expect(again.body.redeemedAt).toBe(noon(TUE));
    });

    it('resgates simultâneos resultam num só resgate', async () => {
      const { user, activity } = await setup();
      const reward = await createReward(user, { type: 'total_xp', threshold: 1 });
      const block = await onceBlock(user, activity.id, MON);
      await completeOn(user, block.id, MON);

      const results = await Promise.all(
        Array.from({ length: 4 }, () => send('post', user, `/api/rewards/${reward.id}/redeem`)),
      );
      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(new Set(results.map((r) => r.body.redeemedAt)).size).toBe(1);
    });

    it('uma resgatada continua resgatada ao editar o nome', async () => {
      const { user, activity } = await setup();
      const reward = await createReward(user, { type: 'total_xp', threshold: 1 });
      const block = await onceBlock(user, activity.id, MON);
      await completeOn(user, block.id, MON);
      await send('post', user, `/api/rewards/${reward.id}/redeem`);

      const edited = await send('patch', user, `/api/rewards/${reward.id}`, {
        title: 'Outro nome',
      });
      expect(edited.body).toMatchObject({ status: 'redeemed', title: 'Outro nome' });
    });
  });

  it('exige autenticação em todas as rotas', async () => {
    const id = '0192f1a0-7b3c-7000-8000-0000000000a1';
    for (const [method, url] of [
      ['get', '/api/rewards'],
      ['post', '/api/rewards'],
      ['patch', `/api/rewards/${id}`],
      ['post', `/api/rewards/${id}/redeem`],
      ['delete', `/api/rewards/${id}`],
    ] as const) {
      expect((await request(server())[method](url)).status).toBe(401);
    }
  });
});
