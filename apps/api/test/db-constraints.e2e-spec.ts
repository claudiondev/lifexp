import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, registerUser } from './helpers.js';

const utc = (date: string) => new Date(`${date}T00:00:00.000Z`);

describe('Restrições do banco para blocos (defesa em profundidade)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;
  let activityId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const user = await registerUser(app);
    userId = user.userId;
    activityId = (await prisma.activity.findFirstOrThrow({ where: { userId } })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const weekly = (overrides: object = {}) => ({
    userId,
    activityId,
    recurrence: 'WEEKLY' as const,
    weekday: 3,
    startTime: '09:00',
    durationMin: 60,
    validFrom: utc('2026-10-07'),
    ...overrides,
  });
  const once = (overrides: object = {}) => ({
    userId,
    activityId,
    recurrence: 'ONCE' as const,
    date: utc('2026-10-07'),
    startTime: '09:00',
    durationMin: 60,
    ...overrides,
  });
  const createBlock = (data: object) => prisma.block.create({ data: data as never });

  describe('Block', () => {
    it('aceita um bloco semanal e um avulso válidos', async () => {
      await expect(createBlock(weekly())).resolves.toBeDefined();
      await expect(createBlock(once())).resolves.toBeDefined();
    });

    it('semanal exige weekday e validFrom e não aceita date', async () => {
      await expect(createBlock(weekly({ weekday: null }))).rejects.toThrow();
      await expect(createBlock(weekly({ validFrom: null }))).rejects.toThrow();
      await expect(createBlock(weekly({ date: utc('2026-10-07') }))).rejects.toThrow();
    });

    it('avulso exige date e não aceita weekday nem validade', async () => {
      await expect(createBlock(once({ date: null }))).rejects.toThrow();
      await expect(createBlock(once({ weekday: 3 }))).rejects.toThrow();
      await expect(createBlock(once({ validFrom: utc('2026-10-07') }))).rejects.toThrow();
      await expect(createBlock(once({ validUntil: utc('2026-10-07') }))).rejects.toThrow();
    });

    it('weekday fica entre 1 e 7', async () => {
      await expect(createBlock(weekly({ weekday: 0 }))).rejects.toThrow();
      await expect(createBlock(weekly({ weekday: 8 }))).rejects.toThrow();
      await expect(createBlock(weekly({ weekday: 1 }))).resolves.toBeDefined();
      await expect(createBlock(weekly({ weekday: 7 }))).resolves.toBeDefined();
    });

    it('startTime precisa ser HH:mm válido', async () => {
      for (const startTime of ['24:00', '9:30', '09:60', '0900', '', '09:30:00']) {
        await expect(createBlock(weekly({ startTime }))).rejects.toThrow();
      }
      await expect(createBlock(weekly({ startTime: '00:00' }))).resolves.toBeDefined();
      await expect(createBlock(weekly({ startTime: '23:00' }))).resolves.toBeDefined();
    });

    it('duração fica entre 15 e 720 minutos, em passos de 5', async () => {
      for (const durationMin of [0, 14, 17, 725, 721]) {
        await expect(createBlock(weekly({ startTime: '00:00', durationMin }))).rejects.toThrow();
      }
      await expect(
        createBlock(weekly({ startTime: '00:00', durationMin: 15 })),
      ).resolves.toBeDefined();
      await expect(
        createBlock(weekly({ startTime: '00:00', durationMin: 720 })),
      ).resolves.toBeDefined();
    });

    it('não atravessa a meia-noite, mas pode terminar exatamente nela', async () => {
      await expect(createBlock(weekly({ startTime: '23:00', durationMin: 65 }))).rejects.toThrow();
      await expect(createBlock(weekly({ startTime: '22:00', durationMin: 180 }))).rejects.toThrow();
      await expect(
        createBlock(weekly({ startTime: '23:00', durationMin: 60 })),
      ).resolves.toBeDefined();
    });

    it('validUntil pode ser o dia anterior a validFrom (série encerrada), mas não antes disso', async () => {
      const validFrom = utc('2026-10-07');
      await expect(
        createBlock(weekly({ validFrom, validUntil: utc('2026-10-06') })),
      ).resolves.toBeDefined();
      await expect(
        createBlock(weekly({ validFrom, validUntil: validFrom })),
      ).resolves.toBeDefined();
      await expect(
        createBlock(weekly({ validFrom, validUntil: utc('2026-10-05') })),
      ).rejects.toThrow();
    });
  });

  describe('BlockException', () => {
    let blockId: string;
    const occurrenceDate = utc('2026-10-07'); // quarta-feira

    beforeAll(async () => {
      blockId = (await createBlock(weekly())).id;
    });

    const createException = (data: object) =>
      prisma.blockException.create({ data: { blockId, occurrenceDate, ...data } as never });
    const freshDate = () => {
      // Cada teste usa uma data de ocorrência própria para não esbarrar na unicidade.
      freshDate.n += 7;
      return new Date(utc('2026-11-04').getTime() + freshDate.n * 86_400_000);
    };
    freshDate.n = 0;

    it('SKIP não altera nada', async () => {
      await expect(
        createException({ type: 'SKIP', occurrenceDate: freshDate() }),
      ).resolves.toBeDefined();
      for (const extra of [
        { newDate: utc('2026-10-08') },
        { newStartTime: '10:00' },
        { newDurationMin: 30 },
      ]) {
        await expect(
          createException({ type: 'SKIP', occurrenceDate: freshDate(), ...extra }),
        ).rejects.toThrow();
      }
    });

    it('OVERRIDE precisa alterar ao menos um campo', async () => {
      await expect(
        createException({ type: 'OVERRIDE', occurrenceDate: freshDate() }),
      ).rejects.toThrow();
      await expect(
        createException({ type: 'OVERRIDE', occurrenceDate: freshDate(), newStartTime: '10:00' }),
      ).resolves.toBeDefined();
      await expect(
        createException({ type: 'OVERRIDE', occurrenceDate: freshDate(), newDurationMin: 30 }),
      ).resolves.toBeDefined();
    });

    it('valida o novo horário e a nova duração', async () => {
      await expect(
        createException({ type: 'OVERRIDE', occurrenceDate: freshDate(), newStartTime: '25:00' }),
      ).rejects.toThrow();
      await expect(
        createException({ type: 'OVERRIDE', occurrenceDate: freshDate(), newDurationMin: 7 }),
      ).rejects.toThrow();
      await expect(
        createException({ type: 'OVERRIDE', occurrenceDate: freshDate(), newDurationMin: 725 }),
      ).rejects.toThrow();
    });

    it('mover só vale dentro da mesma semana (segunda a domingo)', async () => {
      const monday = new Date(utc('2027-02-01')); // segunda
      const sunday = new Date(utc('2027-02-07')); // domingo da mesma semana
      const nextMonday = new Date(utc('2027-02-08'));

      await expect(
        createException({ type: 'OVERRIDE', occurrenceDate: monday, newDate: sunday }),
      ).resolves.toBeDefined();
      await expect(
        createException({ type: 'OVERRIDE', occurrenceDate: sunday, newDate: nextMonday }),
      ).rejects.toThrow();
      await expect(
        createException({
          type: 'OVERRIDE',
          occurrenceDate: utc('2027-03-03'),
          newDate: utc('2027-03-12'),
        }),
      ).rejects.toThrow();
    });

    it('é única por (bloco, data da ocorrência) — RN32', async () => {
      const date = freshDate();
      await createException({ type: 'SKIP', occurrenceDate: date });
      await expect(createException({ type: 'SKIP', occurrenceDate: date })).rejects.toThrow();
    });
  });

  describe('remoção em cascata', () => {
    it('apagar a pessoa apaga seus blocos e exceções', async () => {
      const other = await registerUser(app);
      const otherActivity = await prisma.activity.findFirstOrThrow({
        where: { userId: other.userId },
      });
      const block = await prisma.block.create({
        data: { ...once(), userId: other.userId, activityId: otherActivity.id } as never,
      });
      await prisma.blockException.create({
        data: { blockId: block.id, occurrenceDate: utc('2026-10-07'), type: 'SKIP' },
      });

      await prisma.user.delete({ where: { id: other.userId } });

      expect(await prisma.block.count({ where: { id: block.id } })).toBe(0);
      expect(await prisma.blockException.count({ where: { blockId: block.id } })).toBe(0);
    });
  });
});
