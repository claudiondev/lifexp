import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { goalSchema } from '@lifexp/shared';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { FakeClock, bearer, createTestApp, registerUser, type TestUser } from './helpers.js';

// Quarta 2026-10-07, 12:00 em São Paulo (UTC-3).
const NOON = '2026-10-07T15:00:00.000Z';

describe('Metas e marcos (e2e)', () => {
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

  const areaOf = async (user: TestUser) =>
    (await prisma.area.findFirstOrThrow({ where: { userId: user.userId } })).id;

  const post = (user: TestUser, path: string, body: object = {}) =>
    request(server()).post(path).set(bearer(user)).send(body);
  const patch = (user: TestUser, path: string, body: object) =>
    request(server()).patch(path).set(bearer(user)).send(body);
  const get = (user: TestUser, path: string) => request(server()).get(path).set(bearer(user));
  const del = (user: TestUser, path: string) => request(server()).delete(path).set(bearer(user));

  const createGoal = async (user: TestUser, body: object = {}) => {
    const res = await post(user, '/api/goals', { title: 'Ler 12 livros', ...body });
    expect(res.status).toBe(201);
    return goalSchema.parse(res.body);
  };

  describe('autenticação', () => {
    it.each([
      ['get', '/api/goals'],
      ['post', '/api/goals'],
      ['get', '/api/goals/0192f1a0-7b3c-7000-8000-0000000000c1'],
      ['patch', '/api/goals/0192f1a0-7b3c-7000-8000-0000000000c1'],
      ['delete', '/api/goals/0192f1a0-7b3c-7000-8000-0000000000c1'],
      ['post', '/api/goals/0192f1a0-7b3c-7000-8000-0000000000c1/milestones'],
    ] as const)('%s %s exige login', async (method, path) => {
      expect((await request(server())[method](path)).status).toBe(401);
    });
  });

  describe('criar e ler', () => {
    it('cria uma meta simples com os padrões', async () => {
      const user = await registerUser(app);
      const goal = await createGoal(user, { description: 'Um por mês' });

      expect(goal).toMatchObject({
        title: 'Ler 12 livros',
        description: 'Um por mês',
        areaId: null,
        deadline: null,
        status: 'active',
        unit: null,
        targetValue: null,
        currentValue: null,
        completedAt: null,
        overdue: false,
        progress: { ratio: null, source: null },
        readyToComplete: false,
        milestones: [],
        investedMinutes: 0,
      });
    });

    it('cria com métrica: o valor atual começa em 0', async () => {
      const user = await registerUser(app);
      const goal = await createGoal(user, { targetValue: 12, unit: 'livros' });

      expect(goal).toMatchObject({
        targetValue: 12,
        currentValue: 0,
        unit: 'livros',
        progress: { ratio: 0, source: 'metric' },
      });
    });

    it('cria com área própria, prazo e valor atual', async () => {
      const user = await registerUser(app);
      const areaId = await areaOf(user);
      const goal = await createGoal(user, {
        areaId,
        deadline: '2026-12-31',
        targetValue: 100,
        currentValue: 25,
        unit: 'km',
      });

      expect(goal).toMatchObject({
        areaId,
        deadline: '2026-12-31',
        currentValue: 25,
        progress: { ratio: 0.25, source: 'metric' },
      });
    });

    it.each([
      ['título vazio', { title: ' ' }],
      ['campo desconhecido', { status: 'completed' }],
      ['alvo zero', { targetValue: 0 }],
      ['valor atual sem alvo', { currentValue: 3 }],
      ['unidade sem alvo', { unit: 'km' }],
      ['prazo inválido', { deadline: '2026-02-30' }],
      ['área que não é uuid', { areaId: 'abc' }],
    ])('rejeita %s com 400', async (_name, body) => {
      const user = await registerUser(app);
      expect((await post(user, '/api/goals', { title: 'x', ...body })).status).toBe(400);
    });

    it('área de outra pessoa ou inexistente responde 404 (RS06)', async () => {
      const [ana, bia] = [await registerUser(app), await registerUser(app)];
      const foreign = await areaOf(bia);

      expect((await post(ana, '/api/goals', { title: 'x', areaId: foreign })).status).toBe(404);
      expect(
        (
          await post(ana, '/api/goals', {
            title: 'x',
            areaId: '0192f1a0-7b3c-7000-8000-0000000000ff',
          })
        ).status,
      ).toBe(404);
    });

    it('área arquivada responde 409', async () => {
      const user = await registerUser(app);
      const areaId = await areaOf(user);
      await post(user, `/api/areas/${areaId}/archive`);

      const res = await post(user, '/api/goals', { title: 'x', areaId });
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/arquivada/);
    });

    it('lista só as metas da própria pessoa, em ordem de criação', async () => {
      const [ana, bia] = [await registerUser(app), await registerUser(app)];
      const first = await createGoal(ana, { title: 'Primeira' });
      const second = await createGoal(ana, { title: 'Segunda' });
      await createGoal(bia, { title: 'Da Bia' });

      const res = await get(ana, '/api/goals');
      expect(res.status).toBe(200);
      expect(res.body.map((g: { id: string }) => g.id)).toEqual([first.id, second.id]);
    });

    it('a ordem da lista é a de criação, não a de edição', async () => {
      const user = await registerUser(app);
      const first = await createGoal(user, { title: 'Primeira' });
      const second = await createGoal(user, { title: 'Segunda' });
      // a primeira é editada depois, mas continua na frente
      await prisma.goal.update({
        where: { id: second.id },
        data: { createdAt: new Date('2020-01-01T00:00:00.000Z') },
      });

      const res = await get(user, '/api/goals');
      expect(res.body.map((g: { id: string }) => g.id)).toEqual([second.id, first.id]);
    });

    it('detalhe de meta alheia ou inexistente é 404; id inválido é 400', async () => {
      const [ana, bia] = [await registerUser(app), await registerUser(app)];
      const goal = await createGoal(bia);

      expect((await get(ana, `/api/goals/${goal.id}`)).status).toBe(404);
      expect((await get(ana, '/api/goals/0192f1a0-7b3c-7000-8000-0000000000ff')).status).toBe(404);
      expect((await get(ana, '/api/goals/abc')).status).toBe(400);
      expect((await get(bia, `/api/goals/${goal.id}`)).status).toBe(200);
    });
  });

  describe('atrasada (RN22)', () => {
    it('prazo de ontem em meta ativa: atrasada; no próprio dia ou depois: não', async () => {
      const user = await registerUser(app);
      const late = await createGoal(user, { deadline: '2026-10-06' });
      const today = await createGoal(user, { deadline: '2026-10-07' });
      const future = await createGoal(user, { deadline: '2026-10-08' });

      expect([late.overdue, today.overdue, future.overdue]).toEqual([true, false, false]);
    });

    it('depende do dia local da pessoa: 03:00Z de quinta ainda é quarta em São Paulo', async () => {
      const user = await registerUser(app);
      const goal = await createGoal(user, { deadline: '2026-10-07' });
      clock.set('2026-10-08T02:59:00.000Z'); // quarta 23:59 em São Paulo
      expect(goalSchema.parse((await get(user, `/api/goals/${goal.id}`)).body).overdue).toBe(false);
      clock.set('2026-10-08T03:00:00.000Z'); // quinta 00:00
      expect(goalSchema.parse((await get(user, `/api/goals/${goal.id}`)).body).overdue).toBe(true);
    });

    it('usa o fuso da própria pessoa (Kiritimati já está em 08/10)', async () => {
      const user = await registerUser(app);
      await patch(user, '/api/users/me', { timezone: 'Pacific/Kiritimati' });
      const goal = await createGoal(user, { deadline: '2026-10-07' });
      expect(goal.overdue).toBe(true);
    });
  });

  describe('editar', () => {
    it('altera título, descrição e prazo, e limpa com nulo', async () => {
      const user = await registerUser(app);
      const goal = await createGoal(user, { description: 'a', deadline: '2026-12-01' });

      const res = await patch(user, `/api/goals/${goal.id}`, {
        title: 'Novo título',
        description: null,
        deadline: null,
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ title: 'Novo título', description: null, deadline: null });
    });

    it('atualiza o valor atual e o progresso acompanha', async () => {
      const user = await registerUser(app);
      const goal = await createGoal(user, { targetValue: 200, unit: 'km' });

      const res = await patch(user, `/api/goals/${goal.id}`, { currentValue: 50 });

      expect(res.body).toMatchObject({
        currentValue: 50,
        progress: { ratio: 0.25, source: 'metric' },
      });
    });

    it('passar do alvo vale 100% e deixa a meta pronta para concluir', async () => {
      const user = await registerUser(app);
      const goal = await createGoal(user, { targetValue: 10 });

      const res = await patch(user, `/api/goals/${goal.id}`, { currentValue: 15 });

      expect(res.body.progress.ratio).toBe(1);
      expect(res.body.readyToComplete).toBe(true);
      expect(res.body.status).toBe('active');
    });

    it('remover o alvo apaga a métrica inteira', async () => {
      const user = await registerUser(app);
      const goal = await createGoal(user, { targetValue: 10, currentValue: 4, unit: 'km' });

      const res = await patch(user, `/api/goals/${goal.id}`, { targetValue: null });

      expect(res.body).toMatchObject({
        targetValue: null,
        currentValue: null,
        unit: null,
        progress: { ratio: null, source: null },
      });
    });

    it('criar a métrica numa meta que não tinha começa em 0', async () => {
      const user = await registerUser(app);
      const goal = await createGoal(user);

      const res = await patch(user, `/api/goals/${goal.id}`, { targetValue: 5, unit: 'x' });

      expect(res.body).toMatchObject({ targetValue: 5, currentValue: 0, unit: 'x' });
    });

    it('valor atual ou unidade sem valor-alvo é 400', async () => {
      const user = await registerUser(app);
      const goal = await createGoal(user);

      expect((await patch(user, `/api/goals/${goal.id}`, { currentValue: 3 })).status).toBe(400);
      expect((await patch(user, `/api/goals/${goal.id}`, { unit: 'km' })).status).toBe(400);
      expect(
        (await patch(user, `/api/goals/${goal.id}`, { targetValue: null, unit: 'km' })).status,
      ).toBe(400);
    });

    it('rejeita corpo vazio, campo desconhecido (status tem rota própria) e meta alheia', async () => {
      const [ana, bia] = [await registerUser(app), await registerUser(app)];
      const goal = await createGoal(ana);

      expect((await patch(ana, `/api/goals/${goal.id}`, {})).status).toBe(400);
      expect((await patch(ana, `/api/goals/${goal.id}`, { status: 'paused' })).status).toBe(400);
      expect((await patch(bia, `/api/goals/${goal.id}`, { title: 'Invadida' })).status).toBe(404);
      expect(goalSchema.parse((await get(ana, `/api/goals/${goal.id}`)).body).title).toBe(
        'Ler 12 livros',
      );
    });

    it('troca a área só por uma área própria e ativa', async () => {
      const [ana, bia] = [await registerUser(app), await registerUser(app)];
      const goal = await createGoal(ana);
      const own = await areaOf(ana);

      expect((await patch(ana, `/api/goals/${goal.id}`, { areaId: own })).body.areaId).toBe(own);
      expect(
        (await patch(ana, `/api/goals/${goal.id}`, { areaId: await areaOf(bia) })).status,
      ).toBe(404);
      expect((await patch(ana, `/api/goals/${goal.id}`, { areaId: null })).body.areaId).toBeNull();
    });
  });

  describe('excluir', () => {
    it('exclui a meta e é idempotente', async () => {
      const user = await registerUser(app);
      const goal = await createGoal(user);

      expect((await del(user, `/api/goals/${goal.id}`)).status).toBe(204);
      expect((await get(user, `/api/goals/${goal.id}`)).status).toBe(404);
      expect((await del(user, `/api/goals/${goal.id}`)).status).toBe(204);
    });

    it('excluir a meta de outra pessoa não faz nada', async () => {
      const [ana, bia] = [await registerUser(app), await registerUser(app)];
      const goal = await createGoal(ana);

      expect((await del(bia, `/api/goals/${goal.id}`)).status).toBe(204);
      expect((await get(ana, `/api/goals/${goal.id}`)).status).toBe(200);
    });

    it('leva os marcos junto', async () => {
      const user = await registerUser(app);
      const goal = await createGoal(user);
      await post(user, `/api/goals/${goal.id}/milestones`, { title: 'Marco' });

      await del(user, `/api/goals/${goal.id}`);

      expect(await prisma.milestone.count({ where: { goalId: goal.id } })).toBe(0);
    });
  });

  describe('marcos (RF29)', () => {
    it('adiciona marcos na ordem e o progresso passa a ser por marcos', async () => {
      const user = await registerUser(app);
      const goal = await createGoal(user);

      const first = await post(user, `/api/goals/${goal.id}/milestones`, { title: 'Um' });
      const second = await post(user, `/api/goals/${goal.id}/milestones`, { title: 'Dois' });

      expect(first.status).toBe(201);
      expect(second.body.milestones.map((m: { title: string }) => m.title)).toEqual(['Um', 'Dois']);
      expect(second.body.milestones.map((m: { position: number }) => m.position)).toEqual([0, 1]);
      expect(second.body.milestones.every((m: { done: boolean }) => !m.done)).toBe(true);
      expect(second.body.progress).toEqual({ ratio: 0, source: 'milestones' });
    });

    it('renomeia e remove um marco', async () => {
      const user = await registerUser(app);
      const goal = await createGoal(user);
      const created = await post(user, `/api/goals/${goal.id}/milestones`, { title: 'Velho' });
      const milestoneId = created.body.milestones[0].id as string;

      const renamed = await patch(user, `/api/goals/${goal.id}/milestones/${milestoneId}`, {
        title: 'Novo',
      });
      expect(renamed.body.milestones[0].title).toBe('Novo');

      const removed = await del(user, `/api/goals/${goal.id}/milestones/${milestoneId}`);
      expect(removed.status).toBe(200);
      expect(removed.body.milestones).toEqual([]);
      expect(removed.body.progress.source).toBeNull();
    });

    it('rejeita título vazio e campos desconhecidos', async () => {
      const user = await registerUser(app);
      const goal = await createGoal(user);

      expect((await post(user, `/api/goals/${goal.id}/milestones`, { title: '' })).status).toBe(
        400,
      );
      expect(
        (await post(user, `/api/goals/${goal.id}/milestones`, { title: 'x', done: true })).status,
      ).toBe(400);
    });

    it('meta ou marco de outra pessoa responde 404', async () => {
      const [ana, bia] = [await registerUser(app), await registerUser(app)];
      const goal = await createGoal(ana);
      const created = await post(ana, `/api/goals/${goal.id}/milestones`, { title: 'Meu' });
      const milestoneId = created.body.milestones[0].id as string;

      expect((await post(bia, `/api/goals/${goal.id}/milestones`, { title: 'x' })).status).toBe(
        404,
      );
      expect(
        (await patch(bia, `/api/goals/${goal.id}/milestones/${milestoneId}`, { title: 'x' }))
          .status,
      ).toBe(404);
      expect((await del(bia, `/api/goals/${goal.id}/milestones/${milestoneId}`)).status).toBe(404);
      expect(await prisma.milestone.count({ where: { goalId: goal.id } })).toBe(1);
    });

    it('um marco não pode ser mexido pela rota de outra meta da mesma pessoa', async () => {
      const user = await registerUser(app);
      const a = await createGoal(user, { title: 'A' });
      const b = await createGoal(user, { title: 'B' });
      const created = await post(user, `/api/goals/${a.id}/milestones`, { title: 'Da A' });
      const milestoneId = created.body.milestones[0].id as string;

      expect((await del(user, `/api/goals/${b.id}/milestones/${milestoneId}`)).status).toBe(404);
      expect(await prisma.milestone.count({ where: { goalId: a.id } })).toBe(1);
    });
  });
});
