import type { INestApplication } from '@nestjs/common';
import { ACHIEVEMENT_KEYS } from '@lifexp/shared';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, registerUser } from './helpers.js';

const NOW = new Date('2026-10-07T12:00:00.000Z');
const LATER = new Date('2026-10-08T12:00:00.000Z');

describe('Restrições do banco para conquistas e recompensas (defesa em profundidade)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  const achievement = (userId: string, key: string) =>
    prisma.achievement.create({ data: { userId, key, unlockedAt: NOW } });
  const reward = (userId: string, overrides: object = {}) =>
    prisma.reward.create({
      data: { userId, title: 'Jantar fora', trigger: 'LEVEL', threshold: 5, ...overrides },
    });

  describe('Achievement', () => {
    it('aceita TODAS as chaves do catálogo (a lista do banco não ficou para trás)', async () => {
      const { userId } = await registerUser(app);
      for (const key of ACHIEVEMENT_KEYS)
        await expect(achievement(userId, key)).resolves.toBeDefined();
    });

    it('recusa uma chave que não é do catálogo', async () => {
      const { userId } = await registerUser(app);
      await expect(achievement(userId, 'inventada')).rejects.toThrow();
      await expect(achievement(userId, 'FIRST_STEP')).rejects.toThrow();
    });

    it('cada conquista é uma só por pessoa, mas outra pessoa pode ter a mesma', async () => {
      const ana = await registerUser(app);
      const bia = await registerUser(app);
      await achievement(ana.userId, 'first_step');
      await expect(achievement(ana.userId, 'first_step')).rejects.toThrow();
      await expect(achievement(bia.userId, 'first_step')).resolves.toBeDefined();
    });
  });

  describe('Reward', () => {
    it('aceita um gatilho de cada tipo, com a forma certa', async () => {
      const { userId } = await registerUser(app);
      await expect(reward(userId)).resolves.toBeDefined();
      await expect(reward(userId, { trigger: 'STREAK', threshold: 7 })).resolves.toBeDefined();
      await expect(reward(userId, { trigger: 'TOTAL_XP', threshold: 5000 })).resolves.toBeDefined();
      await expect(
        reward(userId, { trigger: 'ACHIEVEMENT', threshold: null, achievementKey: 'constant' }),
      ).resolves.toBeDefined();
    });

    it('o gatilho de conquista tem chave e não tem limiar; os outros, o contrário', async () => {
      const { userId } = await registerUser(app);
      const achievementShape = { trigger: 'ACHIEVEMENT', achievementKey: 'constant' };
      await expect(reward(userId, { ...achievementShape })).rejects.toThrow(); // limiar junto
      await expect(reward(userId, { trigger: 'ACHIEVEMENT', threshold: null })).rejects.toThrow(); // sem chave
      await expect(reward(userId, { achievementKey: 'constant' })).rejects.toThrow(); // chave em nível
      await expect(reward(userId, { threshold: null })).rejects.toThrow(); // nível sem limiar
    });

    it('a chave de conquista do gatilho tem que ser do catálogo', async () => {
      const { userId } = await registerUser(app);
      await expect(
        reward(userId, { trigger: 'ACHIEVEMENT', threshold: null, achievementKey: 'inventada' }),
      ).rejects.toThrow();
    });

    it('limiares dentro das faixas: nível 2 a 100, streak 1 a 365, XP 1 a 1 milhão', async () => {
      const { userId } = await registerUser(app);
      for (const [trigger, threshold] of [
        ['LEVEL', 1],
        ['LEVEL', 101],
        ['STREAK', 0],
        ['STREAK', 366],
        ['TOTAL_XP', 0],
        ['TOTAL_XP', 1_000_001],
      ] as const) {
        await expect(reward(userId, { trigger, threshold })).rejects.toThrow();
      }
      for (const [trigger, threshold] of [
        ['LEVEL', 2],
        ['LEVEL', 100],
        ['STREAK', 1],
        ['STREAK', 365],
        ['TOTAL_XP', 1],
        ['TOTAL_XP', 1_000_000],
      ] as const) {
        await expect(reward(userId, { trigger, threshold })).resolves.toBeDefined();
      }
    });

    it('título de 1 a 100 caracteres e descrição de até 500', async () => {
      const { userId } = await registerUser(app);
      await expect(reward(userId, { title: '   ' })).rejects.toThrow();
      await expect(reward(userId, { title: 'x'.repeat(101) })).rejects.toThrow();
      await expect(reward(userId, { title: 'x'.repeat(100) })).resolves.toBeDefined();
      await expect(reward(userId, { description: 'x'.repeat(501) })).rejects.toThrow();
      await expect(reward(userId, { description: 'x'.repeat(500) })).resolves.toBeDefined();
    });

    it('só se resgata o que foi atingido, e nunca antes de ter sido atingido', async () => {
      const { userId } = await registerUser(app);
      await expect(reward(userId, { redeemedAt: LATER })).rejects.toThrow();
      await expect(reward(userId, { reachedAt: LATER, redeemedAt: NOW })).rejects.toThrow();
      await expect(reward(userId, { reachedAt: NOW, redeemedAt: NOW })).resolves.toBeDefined();
      await expect(reward(userId, { reachedAt: NOW, redeemedAt: LATER })).resolves.toBeDefined();
      await expect(reward(userId, { reachedAt: NOW })).resolves.toBeDefined();
    });
  });
});
