import type { INestApplication } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, registerUser } from './helpers.js';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const CREATED = new Date('2026-10-07T15:00:00.000Z');
const minutesLater = (minutes: number) => new Date(CREATED.getTime() + minutes * 60_000);

describe('Restrições do banco para o token de recuperação de senha (defesa em profundidade)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  const token = (userId: string, overrides: object = {}) =>
    prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: sha256(randomUUID()),
        createdAt: CREATED,
        expiresAt: minutesLater(30),
        ...overrides,
      },
    });

  it('aceita um token válido, e vários para a mesma pessoa', async () => {
    const { userId } = await registerUser(app);
    await expect(token(userId)).resolves.toMatchObject({ usedAt: null });
    await expect(token(userId, { usedAt: minutesLater(5) })).resolves.toBeDefined();
  });

  it('o hash é único: o mesmo token nunca vale para duas linhas', async () => {
    const [a, b] = [await registerUser(app), await registerUser(app)];
    const tokenHash = sha256(randomUUID());
    await token(a.userId, { tokenHash });
    await expect(token(b.userId, { tokenHash })).rejects.toThrow();
  });

  it('só aceita SHA-256 em hexadecimal: um token em claro não entra (RS12)', async () => {
    const { userId } = await registerUser(app);
    const raw = 'Zm9vYmFyLWZvb2Jhci1mb29iYXItZm9vYmFyLWZvb2Jhcg_-';
    await expect(token(userId, { tokenHash: raw })).rejects.toThrow();
    await expect(token(userId, { tokenHash: 'a'.repeat(63) })).rejects.toThrow();
    await expect(token(userId, { tokenHash: 'A'.repeat(64) })).rejects.toThrow();
    await expect(token(userId, { tokenHash: '' })).rejects.toThrow();
  });

  it('a validade é curta: depois da criação e no máximo 1 hora', async () => {
    const { userId } = await registerUser(app);
    await expect(token(userId, { expiresAt: CREATED })).rejects.toThrow();
    await expect(token(userId, { expiresAt: minutesLater(-1) })).rejects.toThrow();
    await expect(token(userId, { expiresAt: minutesLater(61) })).rejects.toThrow();
    await expect(token(userId, { expiresAt: minutesLater(60) })).resolves.toBeDefined();
  });

  it('exige uma pessoa existente, e os tokens somem com ela', async () => {
    await expect(token(randomUUID())).rejects.toThrow();

    const { userId } = await registerUser(app);
    await token(userId);
    await prisma.user.delete({ where: { id: userId } });
    expect(await prisma.passwordResetToken.count({ where: { userId } })).toBe(0);
  });
});
