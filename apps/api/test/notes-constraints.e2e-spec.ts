import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, listActivities, registerUser, type TestUser } from './helpers.js';

const CREATED = new Date('2026-10-07T15:00:00.000Z');

describe('Restrições do banco para as notas (defesa em profundidade)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  const note = (userId: string, overrides: object = {}) =>
    prisma.note.create({
      data: { userId, title: 'Ideias', createdAt: CREATED, updatedAt: CREATED, ...overrides },
    });

  /** Uma pessoa com alvos de vínculo de cada tipo (área, meta, evento e bloco). */
  const withTargets = async () => {
    const user: TestUser = await registerUser(app);
    const [activity] = await listActivities(app, user);
    const goal = await prisma.goal.create({
      data: { userId: user.userId, title: 'Meta' },
    });
    const event = await prisma.calendarEvent.create({
      data: {
        userId: user.userId,
        title: 'Consulta',
        date: new Date('2026-10-20T00:00:00.000Z'),
        category: 'appointment',
      },
    });
    const block = await prisma.block.create({
      data: {
        userId: user.userId,
        activityId: activity!.id,
        recurrence: 'ONCE',
        date: new Date('2026-10-07T00:00:00.000Z'),
        startTime: '09:00',
        durationMin: 60,
      },
    });
    return {
      user,
      areaId: activity!.areaId,
      goalId: goal.id,
      eventId: event.id,
      blockId: block.id,
    };
  };

  it('aceita uma nota simples (conteúdo e tags começam vazios, não fixada)', async () => {
    const { userId } = await registerUser(app);
    await expect(note(userId)).resolves.toMatchObject({
      content: '',
      tags: [],
      pinned: false,
      areaId: null,
      goalId: null,
    });
  });

  it('o título é obrigatório e cabe em 200 caracteres', async () => {
    const { userId } = await registerUser(app);
    await expect(note(userId, { title: '' })).rejects.toThrow();
    await expect(note(userId, { title: '   ' })).rejects.toThrow();
    await expect(note(userId, { title: 'x'.repeat(201) })).rejects.toThrow();
    await expect(note(userId, { title: 'x'.repeat(200) })).resolves.toBeDefined();
  });

  it('o conteúdo cabe em 20 mil caracteres', async () => {
    const { userId } = await registerUser(app);
    await expect(note(userId, { content: 'a'.repeat(20_000) })).resolves.toBeDefined();
    await expect(note(userId, { content: 'a'.repeat(20_001) })).rejects.toThrow();
  });

  describe('tags', () => {
    it('aceita tags com acento, hífen e underline, e até 10', async () => {
      const { userId } = await registerUser(app);
      await expect(
        note(userId, { tags: ['saúde-mental', 'ano_2026', 'ação'] }),
      ).resolves.toBeDefined();
      const ten = Array.from({ length: 10 }, (_, i) => `t${i}`);
      await expect(note(userId, { tags: ten })).resolves.toBeDefined();
    });

    it('recusa mais de 10, repetidas, vazias, com espaço ou "#" e acima de 30 caracteres', async () => {
      const { userId } = await registerUser(app);
      const eleven = Array.from({ length: 11 }, (_, i) => `t${i}`);
      const invalid: [string, string[]][] = [
        ['11 tags', eleven],
        ['repetida', ['a', 'a']],
        ['vazia', ['a', '']],
        ['com espaço', ['a b']],
        ['com tabulação', ['a\tb']],
        ['com #', ['#a']],
        ['31 caracteres', ['x'.repeat(31)]],
      ];
      for (const [label, tags] of invalid) {
        await expect(note(userId, { tags }), label).rejects.toThrow();
      }
      await expect(note(userId, { tags: ['x'.repeat(30)] })).resolves.toBeDefined();
    });

    it('a coluna nunca é nula', async () => {
      const { userId } = await registerUser(app);
      await expect(
        prisma.$executeRaw`INSERT INTO "Note" ("id","userId","title","tags","createdAt","updatedAt")
          VALUES (${randomUUID()}, ${userId}, 'x', NULL, ${CREATED}, ${CREATED})`,
      ).rejects.toThrow();
    });
  });

  describe('vínculo (no máximo um)', () => {
    it('aceita um vínculo de cada tipo, ou nenhum', async () => {
      const t = await withTargets();
      for (const link of [
        {},
        { areaId: t.areaId },
        { goalId: t.goalId },
        { eventId: t.eventId },
        { blockId: t.blockId },
      ]) {
        await expect(note(t.user.userId, link)).resolves.toBeDefined();
      }
    });

    it('recusa dois vínculos ao mesmo tempo', async () => {
      const t = await withTargets();
      await expect(note(t.user.userId, { goalId: t.goalId, eventId: t.eventId })).rejects.toThrow();
      await expect(note(t.user.userId, { areaId: t.areaId, blockId: t.blockId })).rejects.toThrow();
      await expect(
        note(t.user.userId, {
          areaId: t.areaId,
          goalId: t.goalId,
          eventId: t.eventId,
          blockId: t.blockId,
        }),
      ).rejects.toThrow();
    });

    it('o alvo precisa existir', async () => {
      const { userId } = await registerUser(app);
      await expect(note(userId, { goalId: randomUUID() })).rejects.toThrow();
      await expect(note(userId, { eventId: randomUUID() })).rejects.toThrow();
    });

    it('excluir o alvo solta o vínculo, mas a nota continua', async () => {
      const t = await withTargets();
      const goalNote = await note(t.user.userId, { goalId: t.goalId });
      const eventNote = await note(t.user.userId, { eventId: t.eventId });
      const blockNote = await note(t.user.userId, { blockId: t.blockId });

      await prisma.goal.delete({ where: { id: t.goalId } });
      await prisma.calendarEvent.delete({ where: { id: t.eventId } });
      await prisma.block.delete({ where: { id: t.blockId } });

      for (const id of [goalNote.id, eventNote.id, blockNote.id]) {
        await expect(prisma.note.findUniqueOrThrow({ where: { id } })).resolves.toMatchObject({
          goalId: null,
          eventId: null,
          blockId: null,
        });
      }
    });
  });

  it('atualizada nunca antes de criada', async () => {
    const { userId } = await registerUser(app);
    await expect(note(userId, { updatedAt: new Date(CREATED.getTime() - 1) })).rejects.toThrow();
    await expect(note(userId, { updatedAt: CREATED })).resolves.toBeDefined();
  });

  it('exige uma pessoa existente, e as notas somem com ela', async () => {
    await expect(note(randomUUID())).rejects.toThrow();
    const { userId } = await registerUser(app);
    await note(userId);
    await prisma.user.delete({ where: { id: userId } });
    expect(await prisma.note.count({ where: { userId } })).toBe(0);
  });
});
