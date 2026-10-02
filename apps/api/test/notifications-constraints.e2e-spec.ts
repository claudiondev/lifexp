import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, registerUser } from './helpers.js';

const utc = (date: string) => new Date(`${date}T00:00:00.000Z`);

describe('Restrições do banco para notificações e preferências (defesa em profundidade)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  const setup = async () => ({ userId: (await registerUser(app)).userId });
  type Ctx = Awaited<ReturnType<typeof setup>>;

  const base = (ctx: Ctx, overrides: object = {}) => ({
    userId: ctx.userId,
    kind: 'DIGEST' as const,
    title: 'Seu dia',
    body: 'Hoje: 1 bloco.',
    scheduledFor: new Date('2026-10-07T10:00:00.000Z'),
    dedupeKey: 'digest:2026-10-07',
    ...overrides,
  });
  const notification = (ctx: Ctx, overrides: object = {}) =>
    prisma.notification.create({ data: base(ctx, overrides) });

  describe('Notification', () => {
    it('aceita um resumo, um lembrete de bloco e um de evento', async () => {
      const ctx = await setup();
      await expect(notification(ctx)).resolves.toBeDefined();
      await expect(
        notification(ctx, {
          kind: 'BLOCK',
          dedupeKey: 'block:b:2026-10-07:15',
          blockId: 'b',
          occurrenceDate: utc('2026-10-07'),
        }),
      ).resolves.toBeDefined();
      await expect(
        notification(ctx, { kind: 'EVENT', dedupeKey: 'event:e:2026-10-07:60', eventId: 'e' }),
      ).resolves.toBeDefined();
    });

    it('a mesma chave não gera dois avisos para a mesma pessoa (RF55, RN25)', async () => {
      const ctx = await setup();
      await notification(ctx);
      await expect(notification(ctx)).rejects.toThrow();
    });

    it('mas outra pessoa pode ter a mesma chave', async () => {
      const [a, b] = [await setup(), await setup()];
      await notification(a);
      await expect(notification(b)).resolves.toBeDefined();
    });

    it('createMany com skipDuplicates é idempotente: repetir não duplica', async () => {
      const ctx = await setup();
      const data = [base(ctx), base(ctx, { dedupeKey: 'digest:2026-10-08' })];
      const first = await prisma.notification.createMany({ data, skipDuplicates: true });
      const second = await prisma.notification.createMany({ data, skipDuplicates: true });

      expect(first.count).toBe(2);
      expect(second.count).toBe(0);
      expect(await prisma.notification.count({ where: { userId: ctx.userId } })).toBe(2);
    });

    it('rejeita título vazio ou longo, corpo longo e chave vazia ou longa', async () => {
      const ctx = await setup();
      await expect(notification(ctx, { title: '  ' })).rejects.toThrow();
      await expect(
        notification(ctx, { title: 'x'.repeat(201), dedupeKey: 'k1' }),
      ).rejects.toThrow();
      await expect(
        notification(ctx, { body: 'x'.repeat(1001), dedupeKey: 'k2' }),
      ).rejects.toThrow();
      await expect(notification(ctx, { dedupeKey: '' })).rejects.toThrow();
      await expect(notification(ctx, { dedupeKey: 'k'.repeat(201) })).rejects.toThrow();
      await expect(
        notification(ctx, { title: 'x'.repeat(200), dedupeKey: 'k3' }),
      ).resolves.toBeDefined();
    });

    it('a origem combina com o tipo', async () => {
      const ctx = await setup();
      // bloco sem ocorrência, ou sem bloco
      await expect(
        notification(ctx, { kind: 'BLOCK', dedupeKey: 'a', blockId: 'b' }),
      ).rejects.toThrow();
      await expect(
        notification(ctx, { kind: 'BLOCK', dedupeKey: 'b', occurrenceDate: utc('2026-10-07') }),
      ).rejects.toThrow();
      // evento sem eventId, ou com bloco junto
      await expect(notification(ctx, { kind: 'EVENT', dedupeKey: 'c' })).rejects.toThrow();
      await expect(
        notification(ctx, { kind: 'EVENT', dedupeKey: 'd', eventId: 'e', blockId: 'b' }),
      ).rejects.toThrow();
      // resumo não aponta para nada
      await expect(notification(ctx, { dedupeKey: 'e', eventId: 'e' })).rejects.toThrow();
    });

    it('só o resumo pode ter e-mail enviado, e as tentativas são de 0 a 5', async () => {
      const ctx = await setup();
      await expect(
        notification(ctx, { emailSentAt: new Date(), emailAttempts: 1 }),
      ).resolves.toBeDefined();
      await expect(
        notification(ctx, {
          kind: 'EVENT',
          dedupeKey: 'ev',
          eventId: 'e',
          emailSentAt: new Date(),
        }),
      ).rejects.toThrow();
      await expect(notification(ctx, { dedupeKey: 'x1', emailAttempts: 6 })).rejects.toThrow();
      await expect(notification(ctx, { dedupeKey: 'x2', emailAttempts: -1 })).rejects.toThrow();
      await expect(notification(ctx, { dedupeKey: 'x3', emailAttempts: 5 })).resolves.toBeDefined();
    });

    it('excluir a pessoa leva os avisos junto', async () => {
      const ctx = await setup();
      await notification(ctx);
      await prisma.user.delete({ where: { id: ctx.userId } });
      expect(await prisma.notification.count({ where: { userId: ctx.userId } })).toBe(0);
    });
  });

  describe('NotificationPreference', () => {
    const pref = (ctx: Ctx, overrides: object = {}) =>
      prisma.notificationPreference.create({ data: { userId: ctx.userId, ...overrides } });

    it('os padrões do banco são os da regra (RN24): 15 min, resumo às 07:00, e-mail desligado', async () => {
      const created = await pref(await setup());
      expect(created).toMatchObject({
        blockRemindersEnabled: true,
        blockLeadMin: 15,
        eventRemindersEnabled: true,
        digestEnabled: true,
        digestTime: '07:00',
        digestEmailEnabled: false,
      });
    });

    it('só aceita as antecedências de bloco da lista', async () => {
      for (const blockLeadMin of [0, 1, 20, 45, 120, -5]) {
        await expect(pref(await setup(), { blockLeadMin })).rejects.toThrow();
      }
      for (const blockLeadMin of [5, 10, 15, 30, 60]) {
        await expect(pref(await setup(), { blockLeadMin })).resolves.toBeDefined();
      }
    });

    it('rejeita hora do resumo mal formada e aceita os limites do dia', async () => {
      for (const digestTime of ['24:00', '7:00', '07:60', '0700', 'abc']) {
        await expect(pref(await setup(), { digestTime })).rejects.toThrow();
      }
      await expect(pref(await setup(), { digestTime: '00:00' })).resolves.toBeDefined();
      await expect(pref(await setup(), { digestTime: '23:59' })).resolves.toBeDefined();
    });

    it('é 1:1 com a pessoa', async () => {
      const ctx = await setup();
      await pref(ctx);
      await expect(pref(ctx)).rejects.toThrow();
    });
  });
});
