import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, registerUser } from './helpers.js';

describe('Restrições do banco para metas, marcos e o livro-caixa (defesa em profundidade)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  const setup = async () => {
    const user = await registerUser(app);
    const area = await prisma.area.findFirstOrThrow({ where: { userId: user.userId } });
    return { userId: user.userId, areaId: area.id };
  };
  type Ctx = Awaited<ReturnType<typeof setup>>;

  const goal = (ctx: Ctx, overrides: object = {}) =>
    prisma.goal.create({
      data: { userId: ctx.userId, areaId: ctx.areaId, title: 'Ler 12 livros', ...overrides },
    });

  describe('Goal', () => {
    it('aceita uma meta simples e uma com métrica completa', async () => {
      const ctx = await setup();
      await expect(goal(ctx)).resolves.toBeDefined();
      await expect(
        goal(ctx, { targetValue: 12, currentValue: 3, unit: 'livros' }),
      ).resolves.toBeDefined();
    });

    it('rejeita título vazio ou só com espaços e título maior que 120', async () => {
      const ctx = await setup();
      await expect(goal(ctx, { title: '   ' })).rejects.toThrow();
      await expect(goal(ctx, { title: 'x'.repeat(121) })).rejects.toThrow();
      await expect(goal(ctx, { title: 'x'.repeat(120) })).resolves.toBeDefined();
    });

    it('exige valor-alvo positivo e valor atual não negativo (RF28)', async () => {
      const ctx = await setup();
      await expect(goal(ctx, { targetValue: 0 })).rejects.toThrow();
      await expect(goal(ctx, { targetValue: -5 })).rejects.toThrow();
      await expect(goal(ctx, { targetValue: 10, currentValue: -1 })).rejects.toThrow();
      await expect(goal(ctx, { targetValue: 10, currentValue: 0 })).resolves.toBeDefined();
    });

    it('valor atual e unidade não existem sem valor-alvo', async () => {
      const ctx = await setup();
      await expect(goal(ctx, { currentValue: 3 })).rejects.toThrow();
      await expect(goal(ctx, { unit: 'km' })).rejects.toThrow();
    });

    it('concluída exige data de conclusão, e só concluída a tem', async () => {
      const ctx = await setup();
      await expect(goal(ctx, { status: 'COMPLETED' })).rejects.toThrow();
      await expect(goal(ctx, { status: 'ACTIVE', completedAt: new Date() })).rejects.toThrow();
      await expect(
        goal(ctx, { status: 'COMPLETED', completedAt: new Date() }),
      ).resolves.toBeDefined();
    });

    it('excluir a meta solta o vínculo do bloco, que continua existindo', async () => {
      const ctx = await setup();
      const activity = await prisma.activity.findFirstOrThrow({ where: { userId: ctx.userId } });
      const created = await goal(ctx);
      const block = await prisma.block.create({
        data: {
          userId: ctx.userId,
          activityId: activity.id,
          goalId: created.id,
          recurrence: 'ONCE',
          date: new Date('2026-10-07T00:00:00.000Z'),
          startTime: '09:00',
          durationMin: 60,
        },
      });

      await prisma.goal.delete({ where: { id: created.id } });

      expect((await prisma.block.findUniqueOrThrow({ where: { id: block.id } })).goalId).toBeNull();
    });
  });

  describe('Milestone', () => {
    const milestone = (goalId: string, overrides: object = {}) =>
      prisma.milestone.create({
        data: { goalId, title: 'Ler o primeiro', position: 0, ...overrides },
      });

    it('feito exige data de conclusão, e só feito a tem', async () => {
      const ctx = await setup();
      const { id } = await goal(ctx);
      await expect(milestone(id, { done: true })).rejects.toThrow();
      await expect(milestone(id, { done: false, doneAt: new Date() })).rejects.toThrow();
      await expect(milestone(id, { done: true, doneAt: new Date() })).resolves.toBeDefined();
    });

    it('rejeita título vazio', async () => {
      const ctx = await setup();
      const { id } = await goal(ctx);
      await expect(milestone(id, { title: ' ' })).rejects.toThrow();
    });

    it('excluir a meta leva os marcos junto', async () => {
      const ctx = await setup();
      const { id } = await goal(ctx);
      await milestone(id);
      await prisma.goal.delete({ where: { id } });
      expect(await prisma.milestone.count({ where: { goalId: id } })).toBe(0);
    });
  });

  describe('XpTransaction com origem de meta (RN21)', () => {
    const entry = (ctx: Ctx, overrides: object = {}) =>
      prisma.xpTransaction.create({
        data: {
          userId: ctx.userId,
          areaId: ctx.areaId,
          amount: 100,
          type: 'MILESTONE',
          ...overrides,
        } as never,
      });

    it('aceita marco e meta positivos, até o teto de 1000', async () => {
      const ctx = await setup();
      await expect(entry(ctx, { type: 'MILESTONE', amount: 100 })).resolves.toBeDefined();
      await expect(entry(ctx, { type: 'GOAL', amount: 500 })).resolves.toBeDefined();
      await expect(entry(ctx, { type: 'GOAL', amount: 1000 })).resolves.toBeDefined();
    });

    it('rejeita marco ou meta com valor zero, negativo ou acima de 1000', async () => {
      const ctx = await setup();
      for (const type of ['MILESTONE', 'GOAL']) {
        await expect(entry(ctx, { type, amount: 0 })).rejects.toThrow();
        await expect(entry(ctx, { type, amount: -100 })).rejects.toThrow();
        await expect(entry(ctx, { type, amount: 1001 })).rejects.toThrow();
      }
    });

    it('marco ou meta não podem apontar para um lançamento estornado', async () => {
      const ctx = await setup();
      const original = await entry(ctx);
      await expect(entry(ctx, { reversedTransactionId: original.id })).rejects.toThrow();
    });

    it('conclusão de bloco continua limitada a 300', async () => {
      const ctx = await setup();
      await expect(entry(ctx, { type: 'COMPLETION', amount: 301 })).rejects.toThrow();
      await expect(entry(ctx, { type: 'COMPLETION', amount: 300 })).resolves.toBeDefined();
    });

    it('estorno de um lançamento de meta é negativo e aponta para o original', async () => {
      const ctx = await setup();
      const original = await entry(ctx, { type: 'GOAL', amount: 500 });
      await expect(
        entry(ctx, { type: 'REVERSAL', amount: -500, reversedTransactionId: original.id }),
      ).resolves.toBeDefined();
      await expect(
        entry(ctx, { type: 'REVERSAL', amount: -500, reversedTransactionId: original.id }),
      ).rejects.toThrow(); // só se estorna uma vez
    });
  });
});
