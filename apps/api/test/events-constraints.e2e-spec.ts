import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, registerUser } from './helpers.js';

const utc = (date: string) => new Date(`${date}T00:00:00.000Z`);

describe('Restrições do banco para eventos do calendário (defesa em profundidade)', () => {
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

  const event = (ctx: Ctx, overrides: object = {}) =>
    prisma.calendarEvent.create({
      data: {
        userId: ctx.userId,
        title: 'Consulta',
        date: utc('2026-10-20'),
        category: 'medical',
        time: '14:30',
        remindBeforeMin: 60,
        ...overrides,
      },
    });

  it('aceita um evento completo e um de dia todo com lembrete em dias', async () => {
    const ctx = await setup();
    await expect(event(ctx)).resolves.toBeDefined();
    await expect(event(ctx, { time: null, remindBeforeMin: 1440 })).resolves.toBeDefined();
    await expect(event(ctx, { time: null, remindBeforeMin: null })).resolves.toBeDefined();
  });

  it('rejeita título vazio, só com espaços ou maior que 120', async () => {
    const ctx = await setup();
    await expect(event(ctx, { title: '' })).rejects.toThrow();
    await expect(event(ctx, { title: '   ' })).rejects.toThrow();
    await expect(event(ctx, { title: 'x'.repeat(121) })).rejects.toThrow();
    await expect(event(ctx, { title: 'x'.repeat(120) })).resolves.toBeDefined();
  });

  it('rejeita categoria fora da lista e aceita todas as da lista', async () => {
    const ctx = await setup();
    await expect(event(ctx, { category: 'party' })).rejects.toThrow();
    for (const category of ['appointment', 'birthday', 'medical', 'trip', 'deadline', 'other']) {
      await expect(event(ctx, { category })).resolves.toBeDefined();
    }
  });

  it('rejeita hora mal formada e aceita os limites do dia', async () => {
    const ctx = await setup();
    for (const time of ['24:00', '9:00', '09:60', '0900', 'abc']) {
      await expect(event(ctx, { time })).rejects.toThrow();
    }
    await expect(event(ctx, { time: '00:00' })).resolves.toBeDefined();
    await expect(event(ctx, { time: '23:59' })).resolves.toBeDefined();
  });

  it('só aceita as antecedências da lista', async () => {
    const ctx = await setup();
    for (const remindBeforeMin of [5, 30, 120, -15, 10080]) {
      await expect(event(ctx, { remindBeforeMin })).rejects.toThrow();
    }
    for (const remindBeforeMin of [0, 15, 60, 1440, 2880]) {
      await expect(event(ctx, { remindBeforeMin })).resolves.toBeDefined();
    }
  });

  it('evento sem hora recusa lembrete em minutos ou horas', async () => {
    const ctx = await setup();
    for (const remindBeforeMin of [0, 15, 60]) {
      await expect(event(ctx, { time: null, remindBeforeMin })).rejects.toThrow();
    }
    await expect(event(ctx, { time: null, remindBeforeMin: 2880 })).resolves.toBeDefined();
  });

  it('excluir a área solta o vínculo; excluir a pessoa leva os eventos junto', async () => {
    const ctx = await setup();
    const created = await event(ctx, { areaId: ctx.areaId });

    await prisma.area.delete({ where: { id: ctx.areaId } });
    expect(
      (await prisma.calendarEvent.findUniqueOrThrow({ where: { id: created.id } })).areaId,
    ).toBeNull();

    await prisma.user.delete({ where: { id: ctx.userId } });
    expect(await prisma.calendarEvent.count({ where: { userId: ctx.userId } })).toBe(0);
  });
});
