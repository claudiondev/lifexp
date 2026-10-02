import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, registerUser } from './helpers.js';

const utc = (date: string) => new Date(`${date}T00:00:00.000Z`);
const CREATED = new Date('2026-10-11T20:00:00.000Z');

describe('Restrições do banco para a revisão semanal (defesa em profundidade)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  const review = (userId: string, overrides: object = {}) =>
    prisma.weeklyReview.create({
      data: {
        userId,
        weekStart: utc('2026-10-05'),
        createdAt: CREATED,
        updatedAt: CREATED,
        ...overrides,
      },
    });

  it('aceita uma revisão (e os textos começam vazios)', async () => {
    const { userId } = await registerUser(app);
    await expect(review(userId)).resolves.toMatchObject({
      wins: '',
      blockers: '',
      nextPriority: '',
    });
  });

  it('a semana começa na segunda-feira: outro dia da semana é recusado', async () => {
    const { userId } = await registerUser(app);
    for (const day of ['2026-10-06', '2026-10-07', '2026-10-09', '2026-10-10', '2026-10-11']) {
      await expect(review(userId, { weekStart: utc(day) })).rejects.toThrow();
    }
    await expect(review(userId, { weekStart: utc('2026-10-12') })).resolves.toBeDefined();
  });

  it('uma revisão por pessoa e semana; outra pessoa pode ter a mesma semana', async () => {
    const [a, b] = [await registerUser(app), await registerUser(app)];
    await review(a.userId);
    await expect(review(a.userId)).rejects.toThrow();
    await expect(review(b.userId)).resolves.toBeDefined();
    await expect(review(a.userId, { weekStart: utc('2026-10-12') })).resolves.toBeDefined();
  });

  it('cada texto cabe em 2000 caracteres', async () => {
    const { userId } = await registerUser(app);
    const weeks = [
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
      '2026-11-02',
      '2026-11-09',
    ];
    await expect(
      review(userId, { weekStart: utc(weeks[0]!), wins: 'x'.repeat(2000) }),
    ).resolves.toBeDefined();
    await expect(
      review(userId, { weekStart: utc(weeks[1]!), wins: 'x'.repeat(2001) }),
    ).rejects.toThrow();
    await expect(
      review(userId, { weekStart: utc(weeks[2]!), blockers: 'x'.repeat(2001) }),
    ).rejects.toThrow();
    await expect(
      review(userId, { weekStart: utc(weeks[3]!), nextPriority: 'x'.repeat(2001) }),
    ).rejects.toThrow();
  });

  it('atualizada nunca antes de criada', async () => {
    const { userId } = await registerUser(app);
    await expect(review(userId, { updatedAt: new Date(CREATED.getTime() - 1) })).rejects.toThrow();
    await expect(review(userId, { updatedAt: CREATED })).resolves.toBeDefined();
  });

  it('exige uma pessoa existente, e as revisões somem com ela', async () => {
    await expect(review(randomUUID())).rejects.toThrow();
    const { userId } = await registerUser(app);
    await review(userId);
    await prisma.user.delete({ where: { id: userId } });
    expect(await prisma.weeklyReview.count({ where: { userId } })).toBe(0);
  });
});
