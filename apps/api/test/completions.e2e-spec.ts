import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { completionResultSchema, undoResultSchema, levelForXp } from '@lifexp/shared';
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

// Quarta 2026-10-07 às 12:00 em São Paulo (UTC-3): o bloco das 09:00 já começou.
const NOON = '2026-10-07T15:00:00.000Z';

describe('Concluir e desfazer (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const clock = new FakeClock(NOON);
  const server = () => app.getHttpServer();
  const usersToCheck: string[] = [];

  beforeAll(async () => {
    app = await createTestApp({ clock });
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => clock.set(NOON));

  // A invariante central: depois de cada teste, os caches batem com o livro-caixa.
  afterEach(async () => {
    while (usersToCheck.length > 0) await expectCachesConsistent(prisma, usersToCheck.pop()!);
  });

  const setup = async (timezone?: string) => {
    const user = await registerUser(app);
    if (timezone) {
      await request(server()).patch('/api/users/me').set(bearer(user)).send({ timezone });
    }
    usersToCheck.push(user.userId);
    const [activity] = await listActivities(app, user);
    return { user, activity: activity! };
  };

  const createBlock = async (user: TestUser, activityId: string, overrides: object = {}) => {
    const res = await request(server())
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
      });
    return res.body as { id: string };
  };

  const complete = (user: TestUser, blockId: string, date = '2026-10-07') =>
    request(server())
      .post(`/api/blocks/${blockId}/occurrences/${date}/completion`)
      .set(bearer(user));
  const undo = (user: TestUser, blockId: string, date = '2026-10-07') =>
    request(server())
      .delete(`/api/blocks/${blockId}/occurrences/${date}/completion`)
      .set(bearer(user));

  const ledgerOf = (userId: string) =>
    prisma.xpTransaction.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });

  describe('segurança e validação', () => {
    it('exigem autenticação', async () => {
      const id = '0192f1a0-7b3c-7000-8000-000000000001';
      expect(
        (await request(server()).post(`/api/blocks/${id}/occurrences/2026-10-07/completion`))
          .status,
      ).toBe(401);
      expect(
        (await request(server()).delete(`/api/blocks/${id}/occurrences/2026-10-07/completion`))
          .status,
      ).toBe(401);
    });

    it('rejeita id ou data inválidos com 400', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      expect((await complete(user, 'abc')).status).toBe(400);
      expect((await complete(user, block.id, 'amanha')).status).toBe(400);
      expect((await complete(user, block.id, '2026-02-30')).status).toBe(400);
      expect((await undo(user, 'abc')).status).toBe(400);
    });

    it('data que não é uma ocorrência da série responde 404 e nada é gravado', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);

      expect((await complete(user, block.id, '2026-10-08')).status).toBe(404); // quinta: a série é de quartas
      expect((await complete(user, block.id, '2026-09-01')).status).toBe(404); // antes de validFrom
      expect(await prisma.completion.count({ where: { userId: user.userId } })).toBe(0);
      expect(await ledgerOf(user.userId)).toHaveLength(0);
    });

    it('isolamento: B não conclui nem desfaz a ocorrência de A (404), e o XP de A não muda (RS06)', async () => {
      const a = await setup();
      const b = await setup();
      const block = await createBlock(a.user, a.activity.id);
      await complete(a.user, block.id);

      expect((await complete(b.user, block.id)).status).toBe(404);
      expect((await undo(b.user, block.id)).status).toBe(404);

      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: a.user.userId } })).cachedTotalXp,
      ).toBe(60);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: b.user.userId } })).cachedTotalXp,
      ).toBe(0);
      expect(await ledgerOf(b.user.userId)).toHaveLength(0);
    });

    it('o 404 de bloco alheio é igual ao de um bloco que não existe', async () => {
      const a = await setup();
      const b = await setup();
      const block = await createBlock(a.user, a.activity.id);
      const foreign = await complete(b.user, block.id);
      const absent = await complete(b.user, '0192f1a0-7b3c-7000-8000-000000000999');
      expect(foreign.status).toBe(absent.status);
      expect(foreign.body).toEqual(absent.body);
    });
  });

  describe('concluir (RF15)', () => {
    it('gera a conclusão, o lançamento no livro-caixa e atualiza os caches, tudo de uma vez', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id); // 60 min x peso 1,0 = 60 XP

      const res = await complete(user, block.id);

      expect(res.status).toBe(200);
      expect(completionResultSchema.safeParse(res.body).success).toBe(true);
      expect(res.body).toMatchObject({
        alreadyCompleted: false,
        xpAwarded: 60,
        levelBefore: 1,
        levelAfter: 1,
        completion: {
          blockId: block.id,
          occurrenceDate: '2026-10-07',
          completedAt: NOON,
          xpAmount: 60,
        },
        total: { xp: 60, level: 1, xpIntoLevel: 60 },
        area: { areaId: activity.areaId, xp: 60, level: 1 },
      });

      const ledger = await ledgerOf(user.userId);
      expect(ledger).toHaveLength(1);
      expect(ledger[0]).toMatchObject({
        amount: 60,
        type: 'COMPLETION',
        areaId: activity.areaId,
        reversedTransactionId: null,
      });
      const row = await prisma.completion.findFirstOrThrow({ where: { userId: user.userId } });
      expect(ledger[0]?.sourceId).toBe(row.id);
      expect(row).toMatchObject({
        undoneAt: null,
        xpAmount: 60,
        durationMin: 60,
        activityId: activity.id,
        areaId: activity.areaId,
      });
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.userId } })).cachedTotalXp,
      ).toBe(60);
      expect(
        (await prisma.areaProgress.findUniqueOrThrow({ where: { areaId: activity.areaId } }))
          .cachedXp,
      ).toBe(60);
    });

    it('o XP segue duração x peso da atividade (RN01) e o teto de 300 (RN03)', async () => {
      const { user, activity } = await setup();
      await request(server())
        .patch(`/api/activities/${activity.id}`)
        .set(bearer(user))
        .send({ xpWeight: 1.5 });
      const normal = await createBlock(user, activity.id, { durationMin: 90 }); // 90 x 1,5 = 135
      const capped = await createBlock(user, activity.id, { startTime: '00:00', durationMin: 720 }); // 1080 -> 300

      expect((await complete(user, normal.id)).body.xpAwarded).toBe(135);
      expect((await complete(user, capped.id)).body.xpAwarded).toBe(300);
    });

    it('usa a duração EFETIVA: uma ocorrência alterada rende o XP da duração alterada', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      await request(server())
        .put(`/api/blocks/${block.id}/exceptions/2026-10-07`)
        .set(bearer(user))
        .send({ type: 'override', newDurationMin: 30 });

      expect((await complete(user, block.id)).body.xpAwarded).toBe(30);
    });

    it('o XP fica congelado: mudar o peso depois não altera o que já foi ganho', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      await complete(user, block.id);

      await request(server())
        .patch(`/api/activities/${activity.id}`)
        .set(bearer(user))
        .send({ xpWeight: 2 });
      await undo(user, block.id); // o estorno devolve os 60 originais, não 120

      expect((await ledgerOf(user.userId)).map((entry) => entry.amount)).toEqual([60, -60]);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.userId } })).cachedTotalXp,
      ).toBe(0);
    });

    it('subir de nível aparece no resultado (antes e depois), e o nível geral e o da área acompanham', async () => {
      const { user, activity } = await setup();
      const first = await createBlock(user, activity.id);
      const second = await createBlock(user, activity.id, { startTime: '14:00' });
      clock.set('2026-10-07T18:00:00.000Z'); // 15:00 em SP: os dois blocos já começaram

      const one = await complete(user, first.id);
      const two = await complete(user, second.id); // 60 + 60 = 120 XP: cruza os 100 do nível 2

      expect(one.body).toMatchObject({ levelBefore: 1, levelAfter: 1 });
      expect(two.body).toMatchObject({
        levelBefore: 1,
        levelAfter: 2,
        total: { xp: 120, level: 2, xpIntoLevel: 20 },
      });
      expect(two.body.area).toMatchObject({ xp: 120, level: 2 });
      expect(
        (await prisma.areaProgress.findUniqueOrThrow({ where: { areaId: activity.areaId } }))
          .cachedLevel,
      ).toBe(2);
    });

    it('funciona em bloco avulso', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id, {
        recurrence: 'once',
        date: '2026-10-07',
        weekday: undefined,
        validFrom: undefined,
      });
      expect((await complete(user, block.id)).body.xpAwarded).toBe(60);
    });

    it('uma ocorrência movida conclui pela data ORIGINAL e a janela usa o dia e horário novos', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      await request(server())
        .put(`/api/blocks/${block.id}/exceptions/2026-10-07`)
        .set(bearer(user))
        .send({ type: 'override', newDate: '2026-10-09' }); // quarta -> sexta

      // hoje é quarta 12:00: a ocorrência agora é na sexta, então ainda não começou
      expect((await complete(user, block.id, '2026-10-07')).status).toBe(409);

      clock.set('2026-10-09T13:00:00.000Z'); // sexta 10:00 em SP
      expect((await complete(user, block.id, '2026-10-07')).status).toBe(200);
    });
  });

  describe('idempotência (RN07, RS18)', () => {
    it('concluir de novo devolve a mesma conclusão, sem XP novo nem lançamento novo', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      const first = await complete(user, block.id);
      clock.set('2026-10-07T16:00:00.000Z');

      const second = await complete(user, block.id);

      expect(second.status).toBe(200);
      expect(second.body).toMatchObject({
        alreadyCompleted: true,
        xpAwarded: 0,
        total: { xp: 60 },
      });
      expect(second.body.completion.completedAt).toBe(first.body.completion.completedAt); // mantém a hora original
      expect(await ledgerOf(user.userId)).toHaveLength(1);
      expect(await prisma.completion.count({ where: { userId: user.userId } })).toBe(1);
    });

    it('continua respondendo 200 mesmo depois que a janela fecha (já está concluída)', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      await complete(user, block.id);

      clock.set('2026-10-12T12:00:00.000Z'); // dias depois

      const again = await complete(user, block.id);
      expect(again.status).toBe(200);
      expect(again.body.alreadyCompleted).toBe(true);
    });

    it('cinco cliques simultâneos dão XP uma única vez', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);

      const results = await Promise.all(Array.from({ length: 5 }, () => complete(user, block.id)));

      expect(results.every((res) => res.status === 200)).toBe(true);
      expect(results.filter((res) => !res.body.alreadyCompleted)).toHaveLength(1);
      expect(results.reduce((sum, res) => sum + res.body.xpAwarded, 0)).toBe(60);
      expect(await ledgerOf(user.userId)).toHaveLength(1);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.userId } })).cachedTotalXp,
      ).toBe(60);
    });

    it('conclusões simultâneas de ocorrências DIFERENTES não perdem XP uma da outra', async () => {
      const { user, activity } = await setup();
      const blocks = await Promise.all(
        ['06:00', '07:00', '08:00', '09:00', '10:00'].map((startTime) =>
          createBlock(user, activity.id, { startTime }),
        ),
      );

      const results = await Promise.all(blocks.map((block) => complete(user, block.id)));

      expect(results.every((res) => res.status === 200 && !res.body.alreadyCompleted)).toBe(true);
      const user2 = await prisma.user.findUniqueOrThrow({ where: { id: user.userId } });
      expect(user2.cachedTotalXp).toBe(300);
      expect(await ledgerOf(user.userId)).toHaveLength(5);
      expect(
        (await prisma.areaProgress.findUniqueOrThrow({ where: { areaId: activity.areaId } }))
          .cachedLevel,
      ).toBe(levelForXp(300));
    });
  });

  describe('janela de conclusão (RN08, RN10, RN11)', () => {
    it('antes do início do bloco: 409, e nada é gravado (RN10)', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      clock.set('2026-10-07T11:59:59.999Z'); // 08:59:59.999 em SP

      const res = await complete(user, block.id);

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/ainda não começou/);
      expect(await prisma.completion.count({ where: { userId: user.userId } })).toBe(0);
      expect(await ledgerOf(user.userId)).toHaveLength(0);
    });

    it('no instante exato do início já pode concluir', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      clock.set('2026-10-07T12:00:00.000Z'); // 09:00:00.000 em SP
      expect((await complete(user, block.id)).status).toBe(200);
    });

    it('no dia seguinte ainda pode, até 23:59:59.999; um milissegundo depois, não', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);

      clock.set('2026-10-09T02:59:59.999Z'); // 23:59:59.999 de quinta em SP
      expect((await complete(user, block.id)).status).toBe(200);

      const other = await createBlock(user, activity.id, { startTime: '10:00' });
      clock.set('2026-10-09T03:00:00.000Z'); // 00:00 de sexta: fechou
      const late = await complete(user, other.id);
      expect(late.status).toBe(409);
      expect(late.body.message).toMatch(/prazo para concluir terminou/);
    });

    it('o fuso da pessoa decide: o mesmo instante abre a janela em Tóquio e não em São Paulo', async () => {
      // 02:00 UTC de quarta: em Tóquio já são 11:00 (bloco das 09:00 começou); em São Paulo ainda é terça 23:00
      clock.set('2026-10-07T02:00:00.000Z');
      const tokyo = await setup('Asia/Tokyo');
      const saoPaulo = await setup('America/Sao_Paulo');
      const tokyoBlock = await createBlock(tokyo.user, tokyo.activity.id);
      const spBlock = await createBlock(saoPaulo.user, saoPaulo.activity.id);

      expect((await complete(tokyo.user, tokyoBlock.id)).status).toBe(200);
      expect((await complete(saoPaulo.user, spBlock.id)).status).toBe(409);
    });

    it('ocorrência pulada não conclui, e depois de restaurada volta a concluir (RN11)', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      await request(server())
        .put(`/api/blocks/${block.id}/exceptions/2026-10-07`)
        .set(bearer(user))
        .send({ type: 'skip' });

      const blocked = await complete(user, block.id);
      expect(blocked.status).toBe(409);
      expect(blocked.body.message).toMatch(/pulada/);
      expect(await ledgerOf(user.userId)).toHaveLength(0);

      await request(server())
        .delete(`/api/blocks/${block.id}/exceptions/2026-10-07`)
        .set(bearer(user));
      expect((await complete(user, block.id)).status).toBe(200);
    });
  });

  describe('desfazer (RF16, RN06, RN09)', () => {
    it('devolve o XP por um ESTORNO, sem apagar nada do histórico', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      await complete(user, block.id);

      const res = await undo(user, block.id);

      expect(res.status).toBe(200);
      expect(undoResultSchema.safeParse(res.body).success).toBe(true);
      expect(res.body).toMatchObject({
        xpReverted: 60,
        total: { xp: 0, level: 1 },
        area: { xp: 0 },
      });

      const ledger = await ledgerOf(user.userId);
      expect(ledger.map((entry) => [entry.type, entry.amount])).toEqual([
        ['COMPLETION', 60],
        ['REVERSAL', -60],
      ]);
      expect(ledger[1]?.reversedTransactionId).toBe(ledger[0]?.id);
      const row = await prisma.completion.findFirstOrThrow({ where: { userId: user.userId } });
      expect(row.undoneAt).not.toBeNull(); // a linha fica, marcada como desfeita
    });

    it('devolve exatamente o XP que aquela conclusão rendeu, qualquer que seja o valor', async () => {
      const { user, activity } = await setup();
      await request(server())
        .patch(`/api/activities/${activity.id}`)
        .set(bearer(user))
        .send({ xpWeight: 1.5 });
      const block = await createBlock(user, activity.id, { durationMin: 90 }); // 90 x 1,5 = 135 XP
      const done = await complete(user, block.id);
      expect(done.body.xpAwarded).toBe(135);

      const res = await undo(user, block.id);

      expect(res.body).toMatchObject({ xpReverted: 135, total: { xp: 0 }, area: { xp: 0 } });
      expect((await ledgerOf(user.userId)).map((entry) => entry.amount)).toEqual([135, -135]);
    });

    it('desfazer só uma de várias conclusões devolve só o XP dela', async () => {
      const { user, activity } = await setup();
      const small = await createBlock(user, activity.id, { startTime: '06:00', durationMin: 30 }); // 30 XP
      const big = await createBlock(user, activity.id, { startTime: '07:00', durationMin: 120 }); // 120 XP
      await complete(user, small.id);
      await complete(user, big.id);

      const res = await undo(user, small.id);

      expect(res.body).toMatchObject({ xpReverted: 30, total: { xp: 120 } });
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.userId } })).cachedTotalXp,
      ).toBe(120);
    });

    it('é idempotente: desfazer de novo, ou o que nunca foi concluído, não faz nada', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      const never = await undo(user, block.id);
      expect(never.status).toBe(200);
      expect(never.body).toMatchObject({ xpReverted: 0, area: null });

      await complete(user, block.id);
      await undo(user, block.id);
      const again = await undo(user, block.id);

      expect(again.body.xpReverted).toBe(0);
      expect(await ledgerOf(user.userId)).toHaveLength(2); // nada de estorno duplicado
    });

    it('só dentro da janela: depois dela a conclusão é definitiva (409)', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      await complete(user, block.id);

      clock.set('2026-10-09T02:59:59.999Z'); // último instante da janela
      const ok = await undo(user, block.id);
      expect(ok.status).toBe(200);
      await complete(user, block.id); // refaz

      clock.set('2026-10-09T03:00:00.000Z');
      const late = await undo(user, block.id);
      expect(late.status).toBe(409);
      expect(late.body.message).toMatch(/prazo para desfazer terminou/);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.userId } })).cachedTotalXp,
      ).toBe(60);
    });

    it('descer de nível ao desfazer atualiza o nível geral e o da área', async () => {
      const { user, activity } = await setup();
      const first = await createBlock(user, activity.id);
      const second = await createBlock(user, activity.id, { startTime: '10:00' });
      await complete(user, first.id);
      await complete(user, second.id); // 120 XP: nível 2

      const res = await undo(user, second.id);

      expect(res.body).toMatchObject({
        xpReverted: 60,
        total: { xp: 60, level: 1 },
        area: { xp: 60, level: 1 },
      });
      expect(
        (await prisma.areaProgress.findUniqueOrThrow({ where: { areaId: activity.areaId } }))
          .cachedLevel,
      ).toBe(1);
    });

    it('concluir de novo depois de desfazer reaproveita a mesma linha e soma um lançamento novo', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      const first = await complete(user, block.id);
      const rowBefore = await prisma.completion.findFirstOrThrow({
        where: { userId: user.userId },
      });
      await undo(user, block.id);
      clock.set('2026-10-07T16:30:00.000Z');

      const again = await complete(user, block.id);

      expect(again.body).toMatchObject({ alreadyCompleted: false, xpAwarded: 60 });
      expect(again.body.completion.completedAt).toBe('2026-10-07T16:30:00.000Z');
      expect(again.body.completion.completedAt).not.toBe(first.body.completion.completedAt);
      const rows = await prisma.completion.findMany({ where: { userId: user.userId } });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(rowBefore.id);
      expect(rows[0]?.undoneAt).toBeNull();
      expect((await ledgerOf(user.userId)).map((entry) => entry.amount)).toEqual([60, -60, 60]);
    });

    it('vários ciclos de concluir e desfazer mantêm o livro-caixa e os caches coerentes', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);

      for (let round = 0; round < 4; round++) {
        await complete(user, block.id);
        await undo(user, block.id);
      }
      await complete(user, block.id);

      const ledger = await ledgerOf(user.userId);
      expect(ledger).toHaveLength(9);
      expect(ledger.reduce((sum, entry) => sum + entry.amount, 0)).toBe(60);
    });

    it('conclusão e desfazer simultâneos terminam sempre num estado coerente', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      await complete(user, block.id);

      await Promise.all([undo(user, block.id), complete(user, block.id), undo(user, block.id)]);

      const total = (await prisma.user.findUniqueOrThrow({ where: { id: user.userId } }))
        .cachedTotalXp;
      expect([0, 60]).toContain(total);
      const activeRows = await prisma.completion.count({
        where: { userId: user.userId, undoneAt: null },
      });
      expect(activeRows * 60).toBe(total);
    });

    it('a data de uma ocorrência que não existe responde 404', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      expect((await undo(user, block.id, '2026-10-08')).status).toBe(404);
    });
  });
});
