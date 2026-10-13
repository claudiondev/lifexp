import type { INestApplication } from '@nestjs/common';
import { LEISURE_ICONS } from '@lifexp/shared';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, registerUser } from './helpers.js';

describe('Restrições do banco para o tempo de lazer (defesa em profundidade)', () => {
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
    const activity = await prisma.activity.findFirstOrThrow({ where: { userId: user.userId } });
    return { userId: user.userId, activityId: activity.id, areaId: activity.areaId };
  };
  type Ctx = Awaited<ReturnType<typeof setup>>;

  const option = (ctx: Ctx, overrides: object = {}) =>
    prisma.leisureOption.create({
      data: { userId: ctx.userId, name: 'Instagram', icon: 'smartphone', ...overrides },
    });

  const session = (ctx: Ctx, optionId: string, overrides: object = {}) =>
    prisma.leisureSession.create({
      data: {
        userId: ctx.userId,
        optionId,
        startedAt: new Date('2026-10-12T12:00:00Z'),
        limitMin: 30,
        ...overrides,
      },
    });

  describe('Activity.leisurePercent', () => {
    it('aceita nulo, 25, 50 e 100 e recusa o resto', async () => {
      const ctx = await setup();
      const set = (leisurePercent: number | null) =>
        prisma.activity.update({ where: { id: ctx.activityId }, data: { leisurePercent } });
      for (const value of [null, 25, 50, 100]) await expect(set(value)).resolves.toBeDefined();
      for (const value of [0, 10, 75, 101, -25]) {
        await expect(set(value)).rejects.toThrow(/Activity_leisurePercent_check/);
      }
    });
  });

  describe('Completion.leisureMin', () => {
    it('vai de 0 a 720', async () => {
      const ctx = await setup();
      const block = await prisma.block.create({
        data: {
          userId: ctx.userId,
          activityId: ctx.activityId,
          recurrence: 'ONCE',
          date: new Date('2026-10-12'),
          startTime: '10:00',
          durationMin: 60,
        } as never,
      });
      let day = 0;
      const completion = (leisureMin: number) =>
        prisma.completion.create({
          data: {
            userId: ctx.userId,
            blockId: block.id,
            occurrenceDate: new Date(Date.UTC(2026, 9, 12 + day++)),
            completedAt: new Date('2026-10-12T13:00:00Z'),
            activityId: ctx.activityId,
            areaId: ctx.areaId,
            durationMin: 60,
            xpAmount: 60,
            leisureMin,
          },
        });
      await expect(completion(0)).resolves.toBeDefined();
      await expect(completion(720)).resolves.toBeDefined();
      await expect(completion(-1)).rejects.toThrow(/Completion_leisureMin_check/);
      await expect(completion(721)).rejects.toThrow(/Completion_leisureMin_check/);
    });
  });

  describe('LeisureOption', () => {
    it('aceita todos os ícones da lista fixa', async () => {
      const ctx = await setup();
      for (const icon of LEISURE_ICONS) await expect(option(ctx, { icon })).resolves.toBeDefined();
    });

    it('recusa ícone fora da lista', async () => {
      const ctx = await setup();
      await expect(option(ctx, { icon: 'foguete' })).rejects.toThrow(/LeisureOption_icon_check/);
    });

    it('nome de 1 a 40 caracteres', async () => {
      const ctx = await setup();
      await expect(option(ctx, { name: '' })).rejects.toThrow(/LeisureOption_name_length_check/);
      await expect(option(ctx, { name: 'x'.repeat(41) })).rejects.toThrow(
        /LeisureOption_name_length_check/,
      );
      await expect(option(ctx, { name: 'x'.repeat(40) })).resolves.toBeDefined();
      await expect(option(ctx, { name: 'x' })).resolves.toBeDefined();
    });
  });

  describe('LeisureSession', () => {
    it('limite de 1 minuto a uma semana', async () => {
      const ctx = await setup();
      const { id } = await option(ctx);
      await expect(session(ctx, id, { limitMin: 0 })).rejects.toThrow(
        /LeisureSession_limitMin_check/,
      );
      await expect(session(ctx, id, { limitMin: 10081 })).rejects.toThrow(
        /LeisureSession_limitMin_check/,
      );
      await expect(session(ctx, id, { limitMin: 1 })).resolves.toBeDefined();
      await expect(session(ctx, id, { limitMin: 10080 })).resolves.toBeDefined();
    });

    it('não termina antes de começar', async () => {
      const ctx = await setup();
      const { id } = await option(ctx);
      await expect(
        session(ctx, id, { stoppedAt: new Date('2026-10-12T11:59:59Z') }),
      ).rejects.toThrow(/LeisureSession_stoppedAt_check/);
      await expect(
        session(ctx, id, { stoppedAt: new Date('2026-10-12T12:00:00Z') }),
      ).resolves.toBeDefined();
    });

    it('a opção não pode ser excluída enquanto tem sessão (arquivar, nunca excluir)', async () => {
      const ctx = await setup();
      const { id } = await option(ctx);
      await session(ctx, id);
      await expect(prisma.leisureOption.delete({ where: { id } })).rejects.toThrow();
    });
  });
});
