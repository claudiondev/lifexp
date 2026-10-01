import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, registerUser } from './helpers.js';

const utc = (date: string) => new Date(`${date}T00:00:00.000Z`);

describe('Restrições do banco para o livro-caixa de XP (defesa em profundidade)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  /** Cada teste ganha a sua própria pessoa, área e bloco, para não depender dos outros. */
  const setup = async () => {
    const user = await registerUser(app);
    const activity = await prisma.activity.findFirstOrThrow({ where: { userId: user.userId } });
    const block = await prisma.block.create({
      data: {
        userId: user.userId,
        activityId: activity.id,
        recurrence: 'ONCE',
        date: utc('2026-10-07'),
        startTime: '09:00',
        durationMin: 60,
      },
    });
    return {
      userId: user.userId,
      areaId: activity.areaId,
      activityId: activity.id,
      blockId: block.id,
    };
  };

  type Ctx = Awaited<ReturnType<typeof setup>>;

  const completion = (ctx: Ctx, overrides: object = {}) => ({
    userId: ctx.userId,
    blockId: ctx.blockId,
    occurrenceDate: utc('2026-10-07'),
    completedAt: new Date('2026-10-07T15:00:00.000Z'),
    activityId: ctx.activityId,
    areaId: ctx.areaId,
    durationMin: 60,
    xpAmount: 60,
    ...overrides,
  });

  const createCompletion = (ctx: Ctx, overrides: object = {}) =>
    prisma.completion.create({ data: completion(ctx, overrides) });

  const createXp = (ctx: Ctx, overrides: object = {}) =>
    prisma.xpTransaction.create({
      data: {
        userId: ctx.userId,
        areaId: ctx.areaId,
        amount: 60,
        type: 'COMPLETION',
        ...overrides,
      } as never,
    });

  describe('Completion', () => {
    it('aceita uma conclusão válida', async () => {
      const ctx = await setup();
      await expect(createCompletion(ctx)).resolves.toBeDefined();
    });

    it('o XP fica entre 0 e 300 (RN03), com os limites inclusos', async () => {
      const ctx = await setup();
      await expect(createCompletion(ctx, { xpAmount: -1 })).rejects.toThrow();
      await expect(createCompletion(ctx, { xpAmount: 301 })).rejects.toThrow();
      await expect(
        createCompletion(ctx, { xpAmount: 0, occurrenceDate: utc('2026-10-08') }),
      ).resolves.toBeDefined();
      await expect(
        createCompletion(ctx, { xpAmount: 300, occurrenceDate: utc('2026-10-09') }),
      ).resolves.toBeDefined();
    });

    it('a duração da foto fica entre 15 e 720 minutos', async () => {
      const ctx = await setup();
      await expect(createCompletion(ctx, { durationMin: 14 })).rejects.toThrow();
      await expect(createCompletion(ctx, { durationMin: 721 })).rejects.toThrow();
      await expect(createCompletion(ctx, { durationMin: 15 })).resolves.toBeDefined();
    });

    it('desfazer não pode acontecer antes de concluir', async () => {
      const ctx = await setup();
      await expect(
        createCompletion(ctx, { undoneAt: new Date('2026-10-07T14:00:00.000Z') }),
      ).rejects.toThrow();
      await expect(
        createCompletion(ctx, { undoneAt: new Date('2026-10-07T15:00:00.000Z') }),
      ).resolves.toBeDefined(); // no mesmo instante vale
    });

    it('é única por (bloco, data da ocorrência): RN07 e RN32', async () => {
      const ctx = await setup();
      await createCompletion(ctx);
      await expect(createCompletion(ctx)).rejects.toThrow();
      await expect(
        createCompletion(ctx, { occurrenceDate: utc('2026-10-14') }),
      ).resolves.toBeDefined();
    });

    it('não deixa apagar um bloco que tem conclusões', async () => {
      const ctx = await setup();
      await createCompletion(ctx);
      await expect(prisma.block.delete({ where: { id: ctx.blockId } })).rejects.toThrow();
      expect(await prisma.block.count({ where: { id: ctx.blockId } })).toBe(1);
    });
  });

  describe('XpTransaction (livro-caixa)', () => {
    it('aceita uma conclusão (positiva, até 300) e o estorno dela (negativo, apontando para ela)', async () => {
      const ctx = await setup();
      const original = await createXp(ctx, { amount: 60 });
      await expect(
        createXp(ctx, { type: 'REVERSAL', amount: -60, reversedTransactionId: original.id }),
      ).resolves.toBeDefined();
    });

    it('conclusão precisa ser positiva e no máximo 300', async () => {
      const ctx = await setup();
      for (const amount of [0, -5, 301]) {
        await expect(createXp(ctx, { amount })).rejects.toThrow();
      }
      await expect(createXp(ctx, { amount: 1 })).resolves.toBeDefined();
      await expect(createXp(ctx, { amount: 300 })).resolves.toBeDefined();
    });

    it('conclusão não pode apontar para um lançamento estornado', async () => {
      const ctx = await setup();
      const original = await createXp(ctx);
      await expect(createXp(ctx, { reversedTransactionId: original.id })).rejects.toThrow();
    });

    it('estorno precisa ser negativo e apontar para o lançamento original', async () => {
      const ctx = await setup();
      const original = await createXp(ctx);
      await expect(
        createXp(ctx, { type: 'REVERSAL', amount: 60, reversedTransactionId: original.id }),
      ).rejects.toThrow(); // positivo
      await expect(createXp(ctx, { type: 'REVERSAL', amount: -60 })).rejects.toThrow(); // sem alvo
      await expect(
        createXp(ctx, { type: 'REVERSAL', amount: 0, reversedTransactionId: original.id }),
      ).rejects.toThrow();
    });

    it('um lançamento só pode ser estornado uma vez', async () => {
      const ctx = await setup();
      const original = await createXp(ctx);
      await createXp(ctx, { type: 'REVERSAL', amount: -60, reversedTransactionId: original.id });
      await expect(
        createXp(ctx, { type: 'REVERSAL', amount: -60, reversedTransactionId: original.id }),
      ).rejects.toThrow();
    });

    it('estorno não pode apontar para um lançamento que não existe', async () => {
      const ctx = await setup();
      await expect(
        createXp(ctx, {
          type: 'REVERSAL',
          amount: -60,
          reversedTransactionId: '0192f1a0-7b3c-7000-8000-000000000999',
        }),
      ).rejects.toThrow();
    });

    it('é IMUTÁVEL: nenhum UPDATE passa, nem pelo Prisma nem por SQL direto (RN29)', async () => {
      const ctx = await setup();
      const original = await createXp(ctx, { amount: 60 });

      await expect(
        prisma.xpTransaction.update({ where: { id: original.id }, data: { amount: 999 } }),
      ).rejects.toThrow(/imutável/);
      await expect(
        prisma.$executeRaw`UPDATE "XpTransaction" SET "amount" = 1 WHERE "id" = ${original.id}`,
      ).rejects.toThrow(/imutável/);
      await expect(
        prisma.$executeRaw`UPDATE "XpTransaction" SET "userId" = "userId" WHERE "id" = ${original.id}`,
      ).rejects.toThrow(/imutável/);

      expect(
        (await prisma.xpTransaction.findUniqueOrThrow({ where: { id: original.id } })).amount,
      ).toBe(60);
    });
  });

  describe('caches', () => {
    it('o XP total do usuário nunca fica negativo', async () => {
      const ctx = await setup();
      await expect(
        prisma.user.update({ where: { id: ctx.userId }, data: { cachedTotalXp: -1 } }),
      ).rejects.toThrow();
      await expect(
        prisma.user.update({ where: { id: ctx.userId }, data: { cachedTotalXp: 0 } }),
      ).resolves.toBeDefined();
    });

    it('o progresso por área tem XP >= 0 e nível >= 1', async () => {
      const ctx = await setup();
      await expect(
        prisma.areaProgress.create({
          data: { userId: ctx.userId, areaId: ctx.areaId, cachedXp: -1 },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.areaProgress.create({
          data: { userId: ctx.userId, areaId: ctx.areaId, cachedLevel: 0 },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.areaProgress.create({
          data: { userId: ctx.userId, areaId: ctx.areaId, cachedXp: 0, cachedLevel: 1 },
        }),
      ).resolves.toBeDefined();
    });

    it('há um único progresso por área', async () => {
      const ctx = await setup();
      await prisma.areaProgress.create({ data: { userId: ctx.userId, areaId: ctx.areaId } });
      await expect(
        prisma.areaProgress.create({ data: { userId: ctx.userId, areaId: ctx.areaId } }),
      ).rejects.toThrow();
    });
  });

  describe('excluir a conta (LGPD)', () => {
    it('leva junto conclusões, lançamentos (inclusive estornos ligados entre si) e caches', async () => {
      const ctx = await setup();
      await createCompletion(ctx);
      const original = await createXp(ctx);
      await createXp(ctx, { type: 'REVERSAL', amount: -60, reversedTransactionId: original.id });
      await prisma.areaProgress.create({
        data: { userId: ctx.userId, areaId: ctx.areaId, cachedXp: 0 },
      });

      await prisma.user.delete({ where: { id: ctx.userId } });

      expect(await prisma.completion.count({ where: { userId: ctx.userId } })).toBe(0);
      expect(await prisma.xpTransaction.count({ where: { userId: ctx.userId } })).toBe(0);
      expect(await prisma.areaProgress.count({ where: { userId: ctx.userId } })).toBe(0);
      expect(await prisma.block.count({ where: { id: ctx.blockId } })).toBe(0);
    });
  });
});
