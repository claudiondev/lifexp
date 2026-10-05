import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, registerUser } from './helpers.js';

describe('Restrições do banco para tarefas e o livro-caixa (defesa em profundidade)', () => {
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

  const task = (ctx: Ctx, overrides: object = {}) =>
    prisma.task.create({ data: { userId: ctx.userId, title: 'Pagar a conta', ...overrides } });

  describe('Task', () => {
    it('aceita uma tarefa simples e uma completa', async () => {
      const ctx = await setup();
      await expect(task(ctx)).resolves.toBeDefined();
      await expect(
        task(ctx, {
          areaId: ctx.areaId,
          note: 'a',
          dueDate: new Date('2026-10-07'),
          priority: 'HIGH',
          completedAt: new Date(),
          xpAwarded: 40,
        }),
      ).resolves.toBeDefined();
    });

    it('título de 1 a 120 caracteres', async () => {
      const ctx = await setup();
      await expect(task(ctx, { title: '' })).rejects.toThrow(/Task_title_length_check/);
      await expect(task(ctx, { title: 'x'.repeat(121) })).rejects.toThrow(
        /Task_title_length_check/,
      );
      await expect(task(ctx, { title: 'x'.repeat(120) })).resolves.toBeDefined();
      await expect(task(ctx, { title: 'x' })).resolves.toBeDefined();
    });

    it('anotação nula ou de 1 a 500 caracteres', async () => {
      const ctx = await setup();
      await expect(task(ctx, { note: '' })).rejects.toThrow(/Task_note_length_check/);
      await expect(task(ctx, { note: 'x'.repeat(501) })).rejects.toThrow(/Task_note_length_check/);
      await expect(task(ctx, { note: 'x'.repeat(500) })).resolves.toBeDefined();
      await expect(task(ctx, { note: null })).resolves.toBeDefined();
    });

    it('XP ganho de 0 a 40 (0 vale: o teto diário pode zerar a conclusão)', async () => {
      const ctx = await setup();
      const done = { completedAt: new Date() };
      await expect(task(ctx, { ...done, xpAwarded: -1 })).rejects.toThrow(/Task_xp_awarded_check/);
      await expect(task(ctx, { ...done, xpAwarded: 41 })).rejects.toThrow(/Task_xp_awarded_check/);
      await expect(task(ctx, { ...done, xpAwarded: 0 })).resolves.toBeDefined();
      await expect(task(ctx, { ...done, xpAwarded: 40 })).resolves.toBeDefined();
    });

    it('só tarefa concluída tem XP', async () => {
      const ctx = await setup();
      await expect(task(ctx, { xpAwarded: 10 })).rejects.toThrow(
        /Task_xp_requires_completion_check/,
      );
      await expect(task(ctx, { xpAwarded: 0 })).resolves.toBeDefined();
    });

    it('área e meta excluídas só soltam o vínculo (a tarefa continua)', async () => {
      const ctx = await setup();
      const goal = await prisma.goal.create({
        data: { userId: ctx.userId, title: 'Meta' },
      });
      const created = await task(ctx, { goalId: goal.id });

      await prisma.goal.delete({ where: { id: goal.id } });

      expect(
        (await prisma.task.findUniqueOrThrow({ where: { id: created.id } })).goalId,
      ).toBeNull();
    });

    it('excluir a pessoa leva as tarefas e os passos junto', async () => {
      const ctx = await setup();
      const created = await task(ctx);
      await prisma.taskItem.create({ data: { taskId: created.id, title: 'p', position: 0 } });

      await prisma.user.delete({ where: { id: ctx.userId } });

      expect(await prisma.task.count({ where: { id: created.id } })).toBe(0);
      expect(await prisma.taskItem.count({ where: { taskId: created.id } })).toBe(0);
    });
  });

  describe('TaskItem', () => {
    const item = async (overrides: object = {}) => {
      const ctx = await setup();
      const parent = await task(ctx);
      return prisma.taskItem.create({
        data: { taskId: parent.id, title: 'malas', position: 0, ...overrides },
      });
    };

    it('título de 1 a 120 caracteres e posição não negativa', async () => {
      await expect(item()).resolves.toBeDefined();
      await expect(item({ title: '' })).rejects.toThrow(/TaskItem_title_length_check/);
      await expect(item({ title: 'x'.repeat(121) })).rejects.toThrow(/TaskItem_title_length_check/);
      await expect(item({ title: 'x'.repeat(120) })).resolves.toBeDefined();
      await expect(item({ position: -1 })).rejects.toThrow(/TaskItem_position_check/);
    });
  });

  describe('livro-caixa: lançamento TASK', () => {
    const entry = async (data: object) => {
      const ctx = await setup();
      return prisma.xpTransaction.create({
        data: { userId: ctx.userId, areaId: ctx.areaId, type: 'TASK', amount: 20, ...data },
      });
    };

    it('aceita de 1 a 40', async () => {
      await expect(entry({ amount: 1 })).resolves.toBeDefined();
      await expect(entry({ amount: 40 })).resolves.toBeDefined();
    });

    it('recusa zero, negativo e acima de 40', async () => {
      for (const amount of [0, -5, 41, 100]) {
        await expect(entry({ amount })).rejects.toThrow(/XpTransaction_type_amount_check/);
      }
    });

    it('lançamento TASK não pode apontar para um estorno', async () => {
      const ctx = await setup();
      const original = await prisma.xpTransaction.create({
        data: { userId: ctx.userId, type: 'TASK', amount: 20 },
      });
      await expect(
        prisma.xpTransaction.create({
          data: {
            userId: ctx.userId,
            type: 'TASK',
            amount: 20,
            reversedTransactionId: original.id,
          },
        }),
      ).rejects.toThrow(/XpTransaction_type_amount_check/);
    });

    it('os demais tipos seguem com as regras de antes', async () => {
      const ctx = await setup();
      const make = (type: 'COMPLETION' | 'MILESTONE' | 'QUEST', amount: number) =>
        prisma.xpTransaction.create({ data: { userId: ctx.userId, type, amount } });
      await expect(make('COMPLETION', 300)).resolves.toBeDefined();
      await expect(make('COMPLETION', 301)).rejects.toThrow();
      await expect(make('MILESTONE', 1000)).resolves.toBeDefined();
      await expect(make('QUEST', 5000)).resolves.toBeDefined();
      await expect(make('QUEST', 5001)).rejects.toThrow();
    });
  });
});
