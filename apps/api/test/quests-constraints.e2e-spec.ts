import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, registerUser } from './helpers.js';

const utc = (date: string) => new Date(`${date}T00:00:00.000Z`);
const CREATED = new Date('2026-10-05T03:00:00.000Z');

describe('Restrições do banco para a quest semanal (defesa em profundidade)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  const quest = (userId: string, overrides: object = {}) =>
    prisma.weeklyQuest.create({
      data: { userId, weekStart: utc('2026-10-05'), createdAt: CREATED, ...overrides },
    });
  const item = (questId: string, overrides: object = {}) =>
    prisma.questItem.create({
      data: {
        questId,
        blockId: randomUUID(),
        occurrenceDate: utc('2026-10-07'),
        durationMin: 60,
        xp: 60,
        ...overrides,
      },
    });

  describe('WeeklyQuest', () => {
    it('aceita uma quest ativa, sem data de conclusão', async () => {
      const { userId } = await registerUser(app);
      await expect(quest(userId)).resolves.toMatchObject({ status: 'ACTIVE', completedAt: null });
    });

    it('a semana começa na segunda-feira', async () => {
      const { userId } = await registerUser(app);
      for (const day of ['2026-10-06', '2026-10-09', '2026-10-11']) {
        await expect(quest(userId, { weekStart: utc(day) })).rejects.toThrow();
      }
      await expect(quest(userId, { weekStart: utc('2026-10-12') })).resolves.toBeDefined();
    });

    it('uma quest por pessoa e semana; outra pessoa pode ter a mesma', async () => {
      const [a, b] = [await registerUser(app), await registerUser(app)];
      await quest(a.userId);
      await expect(quest(a.userId)).rejects.toThrow();
      await expect(quest(b.userId)).resolves.toBeDefined();
    });

    it('cumprida se, e somente se, tem data de conclusão', async () => {
      const { userId } = await registerUser(app);
      const done = new Date('2026-10-09T15:00:00.000Z');
      await expect(
        quest(userId, { weekStart: utc('2026-10-05'), status: 'COMPLETED' }),
      ).rejects.toThrow();
      await expect(
        quest(userId, { weekStart: utc('2026-10-12'), completedAt: done }),
      ).rejects.toThrow();
      await expect(
        quest(userId, { weekStart: utc('2026-10-19'), status: 'COMPLETED', completedAt: done }),
      ).resolves.toBeDefined();
    });

    it('a conclusão não pode ser antes da criação', async () => {
      const { userId } = await registerUser(app);
      await expect(
        quest(userId, {
          status: 'COMPLETED',
          completedAt: new Date(CREATED.getTime() - 1),
        }),
      ).rejects.toThrow();
    });

    it('exige uma pessoa existente, e a quest some com ela, com os itens', async () => {
      await expect(quest(randomUUID())).rejects.toThrow();
      const { userId } = await registerUser(app);
      const created = await quest(userId);
      await item(created.id);
      await prisma.user.delete({ where: { id: userId } });
      expect(await prisma.weeklyQuest.count({ where: { userId } })).toBe(0);
      expect(await prisma.questItem.count({ where: { questId: created.id } })).toBe(0);
    });
  });

  describe('QuestItem', () => {
    it('aceita itens, inclusive de blocos que não existem mais (sem chave estrangeira no bloco)', async () => {
      const { userId } = await registerUser(app);
      const { id } = await quest(userId);
      await expect(item(id, { blockId: randomUUID() })).resolves.toBeDefined();
    });

    it('um mesmo bloco e data só uma vez por quest', async () => {
      const { userId } = await registerUser(app);
      const { id } = await quest(userId);
      const blockId = randomUUID();
      await item(id, { blockId });
      await expect(item(id, { blockId })).rejects.toThrow();
      await expect(item(id, { blockId, occurrenceDate: utc('2026-10-08') })).resolves.toBeDefined();
    });

    it('duração de 15 min a 12 h e XP de 0 a 300', async () => {
      const { userId } = await registerUser(app);
      const { id } = await quest(userId);
      for (const durationMin of [14, 721, 0, -5])
        await expect(item(id, { durationMin })).rejects.toThrow();
      for (const durationMin of [15, 720])
        await expect(item(id, { durationMin })).resolves.toBeDefined();
      for (const xp of [-1, 301]) await expect(item(id, { xp })).rejects.toThrow();
      for (const xp of [0, 300]) await expect(item(id, { xp })).resolves.toBeDefined();
    });

    it('exige uma quest existente', async () => {
      await expect(item(randomUUID())).rejects.toThrow();
    });
  });

  describe('livro-caixa com a origem "quest" (RN17)', () => {
    const entry = async (overrides: object = {}) => {
      const { userId } = await registerUser(app);
      return prisma.xpTransaction.create({
        data: { userId, amount: 120, type: 'QUEST', ...overrides } as never,
      });
    };

    it('aceita bônus positivo até 5000, sem área', async () => {
      await expect(entry({ amount: 1 })).resolves.toMatchObject({ type: 'QUEST', areaId: null });
      await expect(entry({ amount: 5000 })).resolves.toBeDefined();
    });

    it('recusa bônus zero, negativo ou acima do teto', async () => {
      for (const amount of [0, -120, 5001]) await expect(entry({ amount })).rejects.toThrow();
    });

    it('um bônus não pode apontar para um lançamento estornado', async () => {
      const original = await entry();
      await expect(
        prisma.xpTransaction.create({
          data: {
            userId: original.userId,
            amount: 50,
            type: 'QUEST',
            reversedTransactionId: original.id,
          } as never,
        }),
      ).rejects.toThrow();
    });

    it('o estorno de um bônus é negativo, aponta para o original e só vale uma vez', async () => {
      const original = await entry();
      const reverse = () =>
        prisma.xpTransaction.create({
          data: {
            userId: original.userId,
            amount: -original.amount,
            type: 'REVERSAL',
            reversedTransactionId: original.id,
          },
        });
      await expect(reverse()).resolves.toBeDefined();
      await expect(reverse()).rejects.toThrow();
    });

    it('os outros tipos continuam com as suas regras (conclusão até 300, marco e meta até 1000)', async () => {
      await expect(entry({ type: 'COMPLETION', amount: 301 })).rejects.toThrow();
      await expect(entry({ type: 'COMPLETION', amount: 300 })).resolves.toBeDefined();
      await expect(entry({ type: 'GOAL', amount: 1001 })).rejects.toThrow();
      await expect(entry({ type: 'MILESTONE', amount: 1000 })).resolves.toBeDefined();
    });

    it('o lançamento continua imutável: não dá para editar o valor do bônus', async () => {
      const original = await entry();
      await expect(
        prisma.xpTransaction.update({ where: { id: original.id }, data: { amount: 5000 } }),
      ).rejects.toThrow();
    });
  });
});
