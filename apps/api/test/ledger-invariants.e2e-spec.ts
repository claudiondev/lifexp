import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { calculateXp, levelForXp } from '@lifexp/shared';
import { CacheRebuildService } from '../src/gamification/cache-rebuild.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  FakeClock,
  bearer,
  createTestApp,
  expectCachesConsistent,
  listActivities,
  registerUser,
  type TestUser,
} from './helpers.js';

const NOON = '2026-10-07T15:00:00.000Z'; // quarta 12:00 em São Paulo

describe('Invariantes do livro-caixa de XP (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let rebuilder: CacheRebuildService;
  const clock = new FakeClock(NOON);
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp({ clock });
    prisma = app.get(PrismaService);
    rebuilder = app.get(CacheRebuildService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => clock.set(NOON));

  const createBlock = async (user: TestUser, activityId: string, overrides: object = {}) =>
    (
      await request(server())
        .post('/api/blocks')
        .set(bearer(user))
        .send({
          recurrence: 'weekly',
          activityId,
          weekday: 3,
          startTime: '09:00',
          durationMin: 60,
          validFrom: '2026-09-02',
          ...overrides,
        })
    ).body as { id: string };
  const complete = (user: TestUser, blockId: string) =>
    request(server())
      .post(`/api/blocks/${blockId}/occurrences/2026-10-07/completion`)
      .set(bearer(user));
  const undo = (user: TestUser, blockId: string) =>
    request(server())
      .delete(`/api/blocks/${blockId}/occurrences/2026-10-07/completion`)
      .set(bearer(user));

  /** Pessoa com XP de verdade no livro-caixa: duas áreas, três conclusões e um estorno. */
  const userWithXp = async () => {
    const user = await registerUser(app);
    const activities = await listActivities(app, user);
    const [a, b] = [activities[0]!, activities[1]!];
    const blocks = [
      await createBlock(user, a.id, { startTime: '06:00', durationMin: 60 }), // 60 (área A)
      await createBlock(user, a.id, { startTime: '07:00', durationMin: 30 }), // 30 (área A)
      await createBlock(user, b.id, { startTime: '08:00', durationMin: 90 }), // 90 (área B)
    ];
    for (const block of blocks) await complete(user, block.id);
    await undo(user, blocks[1]!.id); // estorna os 30
    return { user, areaA: a.areaId, areaB: b.areaId, blocks };
  };

  describe('reconstrução dos caches (RN29)', () => {
    it('com os caches corretos, a verificação não encontra nada e a reconstrução não muda nada', async () => {
      const { user } = await userWithXp();
      expect(await rebuilder.check(user.userId)).toEqual([]);
      expect((await rebuilder.rebuild(user.userId)).discrepancies).toEqual([]);
      await expectCachesConsistent(prisma, user.userId);
    });

    it('detecta e corrige cada tipo de cache errado', async () => {
      const { user, areaA, areaB } = await userWithXp(); // total 150: área A = 60, área B = 90
      // 1) total errado   2) XP da área A errado   3) nível da área B errado   4) cache da área A some
      await prisma.user.update({ where: { id: user.userId }, data: { cachedTotalXp: 9999 } });
      await prisma.areaProgress.update({ where: { areaId: areaB }, data: { cachedLevel: 7 } });
      await prisma.areaProgress.update({ where: { areaId: areaA }, data: { cachedXp: 1 } });

      const found = await rebuilder.check(user.userId);
      expect(found).toHaveLength(3);
      expect(found).toEqual(
        expect.arrayContaining([
          { scope: 'user', cached: 9999, expected: 150 },
          { scope: 'area', areaId: areaA, cached: 1, expected: 60 },
          { scope: 'area', areaId: areaB, cached: 90, expected: 90 },
        ]),
      );

      const report = await rebuilder.rebuild(user.userId);
      expect(report.discrepancies).toHaveLength(3);
      expect(await rebuilder.check(user.userId)).toEqual([]);
      await expectCachesConsistent(prisma, user.userId);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.userId } })).cachedTotalXp,
      ).toBe(150);
    });

    it('recria o cache de uma área cuja linha foi apagada', async () => {
      const { user, areaA } = await userWithXp();
      await prisma.areaProgress.delete({ where: { areaId: areaA } });

      expect(await rebuilder.check(user.userId)).toEqual([
        { scope: 'area', areaId: areaA, cached: 0, expected: 60 },
      ]);
      await rebuilder.rebuild(user.userId);

      expect(
        (await prisma.areaProgress.findUniqueOrThrow({ where: { areaId: areaA } })).cachedXp,
      ).toBe(60);
    });

    it('zera o cache de uma área que não tem nenhum lançamento', async () => {
      const user = await registerUser(app);
      const area = await prisma.area.findFirstOrThrow({ where: { userId: user.userId } });
      await prisma.areaProgress.create({
        data: { userId: user.userId, areaId: area.id, cachedXp: 500, cachedLevel: 4 },
      });
      await prisma.user.update({ where: { id: user.userId }, data: { cachedTotalXp: 500 } });

      expect(await rebuilder.check(user.userId)).toHaveLength(2);
      await rebuilder.rebuild(user.userId);

      expect(
        await prisma.areaProgress.findUniqueOrThrow({ where: { areaId: area.id } }),
      ).toMatchObject({
        cachedXp: 0,
        cachedLevel: 1,
      });
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.userId } })).cachedTotalXp,
      ).toBe(0);
    });

    it('o nível reconstruído sempre acompanha o XP reconstruído', async () => {
      const { user, areaB } = await userWithXp();
      await prisma.areaProgress.update({
        where: { areaId: areaB },
        data: { cachedXp: 5, cachedLevel: 9 },
      });
      await rebuilder.rebuild(user.userId);
      const row = await prisma.areaProgress.findUniqueOrThrow({ where: { areaId: areaB } });
      expect(row.cachedLevel).toBe(levelForXp(row.cachedXp));
    });

    it('é idempotente: reconstruir de novo não encontra mais nada', async () => {
      const { user } = await userWithXp();
      await prisma.user.update({ where: { id: user.userId }, data: { cachedTotalXp: 1 } });
      expect((await rebuilder.rebuild(user.userId)).discrepancies).toHaveLength(1);
      expect((await rebuilder.rebuild(user.userId)).discrepancies).toEqual([]);
    });

    it('não mexe no livro-caixa nem nos caches de outras pessoas', async () => {
      const a = await userWithXp();
      const b = await userWithXp();
      await prisma.user.update({ where: { id: b.user.userId }, data: { cachedTotalXp: 7 } });
      const ledgerBefore = await prisma.xpTransaction.findMany({
        where: { userId: a.user.userId },
        orderBy: { id: 'asc' },
      });

      await rebuilder.rebuild(a.user.userId);

      expect(
        await prisma.xpTransaction.findMany({
          where: { userId: a.user.userId },
          orderBy: { id: 'asc' },
        }),
      ).toEqual(ledgerBefore);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: b.user.userId } })).cachedTotalXp,
      ).toBe(7); // b não foi tocada
    });

    it('uma pessoa sem nenhum XP continua zerada', async () => {
      const user = await registerUser(app);
      expect(await rebuilder.check(user.userId)).toEqual([]);
      expect((await rebuilder.rebuild(user.userId)).discrepancies).toEqual([]);
    });

    it('reconstruir durante conclusões simultâneas termina sempre coerente', async () => {
      const user = await registerUser(app);
      const [activity] = await listActivities(app, user);
      const blocks = await Promise.all(
        ['06:00', '07:00', '08:00', '09:00'].map((startTime) =>
          createBlock(user, activity!.id, { startTime }),
        ),
      );

      await Promise.all([
        ...blocks.map((block) => complete(user, block.id)),
        rebuilder.rebuild(user.userId),
        rebuilder.rebuild(user.userId),
      ]);

      expect(await rebuilder.check(user.userId)).toEqual([]);
      await expectCachesConsistent(prisma, user.userId);
    });
  });

  describe('invariante com operações aleatórias (concluir, desfazer e rajadas simultâneas)', () => {
    // Gerador pseudoaleatório com semente: a falha de uma semente é reproduzível.
    const rng = (seed: number) => () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    it.each([11, 202, 3033])(
      'semente %i: os caches batem com o livro-caixa e com um modelo independente',
      async (seed) => {
        const random = rng(seed);
        const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)] as T;

        const user = await registerUser(app);
        const activities = (await listActivities(app, user)).slice(0, 4);
        const weights = [0.5, 1, 1.5, 2];
        for (const [index, activity] of activities.entries()) {
          await request(server())
            .patch(`/api/activities/${activity.id}`)
            .set(bearer(user))
            .send({ xpWeight: weights[index] });
        }

        // 8 blocos, de durações e áreas variadas, todos já começados (06:00 a 11:00)
        const model = new Map<string, { xp: number; areaId: string; completed: boolean }>();
        const blockIds: string[] = [];
        for (let index = 0; index < 8; index++) {
          const activity = activities[index % activities.length]!;
          const durationMin = pick([15, 30, 45, 60, 90, 120, 240, 720]);
          const startTime =
            durationMin === 720 ? '00:00' : `${String(6 + (index % 6)).padStart(2, '0')}:00`;
          const block = await createBlock(user, activity.id, { startTime, durationMin });
          blockIds.push(block.id);
          model.set(block.id, {
            xp: calculateXp({ durationMin, xpWeight: weights[index % activities.length]! }),
            areaId: activity.areaId,
            completed: false,
          });
        }

        const apply = async (op: 'complete' | 'undo', blockId: string) => {
          const res = op === 'complete' ? await complete(user, blockId) : await undo(user, blockId);
          expect(res.status).toBe(200);
        };

        for (let step = 0; step < 50; step++) {
          const burst = random() < 0.25;
          const count = burst ? 2 + Math.floor(random() * 3) : 1;
          const ops = Array.from({ length: count }, () => ({
            op: pick(['complete', 'undo'] as const),
            blockId: pick(blockIds),
          }));

          if (burst) await Promise.all(ops.map(({ op, blockId }) => apply(op, blockId)));
          else for (const { op, blockId } of ops) await apply(op, blockId);

          // O modelo só enxerga o estado final por bloco: se houve conflito na rajada, lemos o banco.
          for (const blockId of blockIds) {
            const active = await prisma.completion.findFirst({
              where: { blockId, undoneAt: null },
            });
            model.get(blockId)!.completed = active !== null;
          }

          const expectedTotal = [...model.values()]
            .filter((entry) => entry.completed)
            .reduce((sum, entry) => sum + entry.xp, 0);
          const progress = (await request(server()).get('/api/progress').set(bearer(user))).body;
          expect(progress.total.xp).toBe(expectedTotal);
          for (const area of progress.areas as { areaId: string; xp: number }[]) {
            const expectedArea = [...model.values()]
              .filter((entry) => entry.completed && entry.areaId === area.areaId)
              .reduce((sum, entry) => sum + entry.xp, 0);
            expect(area.xp).toBe(expectedArea);
          }
          if (step % 10 === 9) {
            await expectCachesConsistent(prisma, user.userId);
            expect(await rebuilder.check(user.userId)).toEqual([]);
          }
        }

        await expectCachesConsistent(prisma, user.userId);
        expect(await rebuilder.check(user.userId)).toEqual([]);
        // nenhum lançamento foi estornado duas vezes e nenhum valor ficou fora de 1..300
        const ledger = await prisma.xpTransaction.findMany({ where: { userId: user.userId } });
        const reversedIds = ledger
          .filter((entry) => entry.reversedTransactionId)
          .map((entry) => entry.reversedTransactionId);
        expect(new Set(reversedIds).size).toBe(reversedIds.length);
        expect(
          ledger
            .filter((entry) => entry.type === 'COMPLETION')
            .every((entry) => entry.amount >= 1 && entry.amount <= 300),
        ).toBe(true);
      },
      120_000,
    );
  });
});
