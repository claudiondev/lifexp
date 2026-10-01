import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
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

describe('Conclusões e edição de blocos (e2e)', () => {
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

  afterEach(async () => {
    while (usersToCheck.length > 0) await expectCachesConsistent(prisma, usersToCheck.pop()!);
  });

  const setup = async () => {
    const user = await registerUser(app);
    usersToCheck.push(user.userId);
    const activities = await listActivities(app, user);
    return { user, activity: activities[0]!, other: activities[1]! };
  };

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

  const complete = (user: TestUser, blockId: string, date = '2026-10-07') =>
    request(server())
      .post(`/api/blocks/${blockId}/occurrences/${date}/completion`)
      .set(bearer(user));
  const undo = (user: TestUser, blockId: string, date = '2026-10-07') =>
    request(server())
      .delete(`/api/blocks/${blockId}/occurrences/${date}/completion`)
      .set(bearer(user));
  const exception = (user: TestUser, blockId: string, date: string, body: object) =>
    request(server()).put(`/api/blocks/${blockId}/exceptions/${date}`).set(bearer(user)).send(body);
  const restore = (user: TestUser, blockId: string, date: string) =>
    request(server()).delete(`/api/blocks/${blockId}/exceptions/${date}`).set(bearer(user));
  const patch = (user: TestUser, blockId: string, body: object) =>
    request(server()).patch(`/api/blocks/${blockId}`).set(bearer(user)).send(body);
  const remove = (user: TestUser, blockId: string, from: string) =>
    request(server()).delete(`/api/blocks/${blockId}?from=${from}`).set(bearer(user));
  const getWeek = (user: TestUser, weekStart: string) =>
    request(server()).get(`/api/blocks/week?weekStart=${weekStart}`).set(bearer(user));
  const utc = (date: string) => new Date(`${date}T00:00:00.000Z`);

  describe('ocorrência concluída fica travada para pular e alterar', () => {
    it('não deixa pular uma ocorrência concluída (409), e nada é gravado', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      await complete(user, block.id);

      const res = await exception(user, block.id, '2026-10-07', { type: 'skip' });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/Desfaça a conclusão/);
      expect(await prisma.blockException.count({ where: { blockId: block.id } })).toBe(0);
    });

    it('não deixa alterar (horário, duração ou dia) uma ocorrência concluída', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      await complete(user, block.id);

      for (const body of [
        { type: 'override', newStartTime: '14:00' },
        { type: 'override', newDurationMin: 30 },
        { type: 'override', newDate: '2026-10-09' },
      ]) {
        expect((await exception(user, block.id, '2026-10-07', body)).status).toBe(409);
      }
      expect(await prisma.blockException.count({ where: { blockId: block.id } })).toBe(0);
    });

    it('não deixa restaurar uma alteração feita antes da conclusão, mas restaurar sem exceção é inofensivo (204)', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      await exception(user, block.id, '2026-10-07', { type: 'override', newDurationMin: 30 });
      await complete(user, block.id);

      expect((await restore(user, block.id, '2026-10-07')).status).toBe(409);
      expect(await prisma.blockException.count({ where: { blockId: block.id } })).toBe(1);

      // sem nenhuma exceção na data, restaurar não muda nada: continua 204
      expect((await restore(user, block.id, '2026-10-14')).status).toBe(204);
    });

    it('depois de desfazer a conclusão, voltam a valer pular e alterar', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      await complete(user, block.id);
      await undo(user, block.id);

      expect((await exception(user, block.id, '2026-10-07', { type: 'skip' })).status).toBe(200);
      expect((await restore(user, block.id, '2026-10-07')).status).toBe(204);
      expect(
        (await exception(user, block.id, '2026-10-07', { type: 'override', newStartTime: '10:00' }))
          .status,
      ).toBe(200);
    });

    it('a trava vale só para a ocorrência concluída, não para as outras da série', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      await complete(user, block.id);

      expect((await exception(user, block.id, '2026-10-14', { type: 'skip' })).status).toBe(200);
    });

    it('concluir e pular ao mesmo tempo: só um vence e nunca ficam as duas coisas (a trava do bloco)', async () => {
      const { user, activity } = await setup();

      for (let trial = 0; trial < 6; trial++) {
        const block = await createBlock(user, activity.id, {
          startTime: `${String(6 + trial).padStart(2, '0')}:00`,
        });
        const [done, skipped] = await Promise.all([
          complete(user, block.id),
          exception(user, block.id, '2026-10-07', { type: 'skip' }),
        ]);

        expect([done.status, skipped.status].sort()).toEqual([200, 409]);
        const active = await prisma.completion.count({
          where: { blockId: block.id, undoneAt: null },
        });
        const skips = await prisma.blockException.count({
          where: { blockId: block.id, type: 'SKIP' },
        });
        expect(active + skips).toBe(1); // nunca concluída E pulada
      }
    });
  });

  describe('editar "esta e as próximas" com conclusões', () => {
    it('a conclusão acompanha a série nova e a ocorrência continua concluída', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      await complete(user, block.id);

      const edited = await patch(user, block.id, { from: '2026-10-07', startTime: '18:00' });
      expect(edited.status).toBe(200);
      const newId = edited.body.id as string;
      expect(newId).not.toBe(block.id);

      // a linha da conclusão agora pertence ao bloco novo, e a semana mostra a ocorrência concluída
      const row = await prisma.completion.findFirstOrThrow({ where: { userId: user.userId } });
      expect(row.blockId).toBe(newId);
      const week = (await getWeek(user, '2026-10-05')).body;
      expect(week.completions).toEqual([
        { blockId: newId, occurrenceDate: '2026-10-07', completedAt: NOON, xpAmount: 60 },
      ]);
      expect(week.occurrences[0]).toMatchObject({ blockId: newId, startTime: '18:00' });
    });

    it('o passado fica na série antiga e o futuro acompanha', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      clock.set('2026-09-30T15:00:00.000Z');
      await complete(user, block.id, '2026-09-30'); // passado
      clock.set('2026-10-14T15:00:00.000Z');
      await complete(user, block.id, '2026-10-14'); // futuro
      clock.set(NOON);

      const edited = await patch(user, block.id, { from: '2026-10-07', durationMin: 90 });

      const rows = await prisma.completion.findMany({
        where: { userId: user.userId },
        orderBy: { occurrenceDate: 'asc' },
      });
      expect(
        rows.map((row) => [
          row.occurrenceDate.toISOString().slice(0, 10),
          row.blockId === block.id,
        ]),
      ).toEqual([
        ['2026-09-30', true], // ficou na série antiga
        ['2026-10-14', false], // foi para a nova
      ]);
      expect(rows[1]?.blockId).toBe(edited.body.id);
    });

    it('desfazer depois da edição funciona pela série nova', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      await complete(user, block.id);
      const edited = await patch(user, block.id, { from: '2026-10-07', startTime: '18:00' });

      const res = await undo(user, edited.body.id);

      expect(res.status).toBe(200);
      expect(res.body.xpReverted).toBe(60);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.userId } })).cachedTotalXp,
      ).toBe(0);
    });

    it('mudar o dia da semana com conclusão ativa a partir da data é recusado (409) e nada muda', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      await complete(user, block.id);

      const res = await patch(user, block.id, { from: '2026-10-07', weekday: 1 });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/Desfaça as conclusões/);
      expect(await prisma.block.count({ where: { userId: user.userId } })).toBe(1);
      expect((await prisma.block.findUniqueOrThrow({ where: { id: block.id } })).weekday).toBe(3);
      expect(
        await prisma.completion.count({ where: { userId: user.userId, undoneAt: null } }),
      ).toBe(1);
    });

    it('mudar o dia da semana é permitido se as conclusões são só anteriores à data, ou foram desfeitas', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      clock.set('2026-09-30T15:00:00.000Z');
      await complete(user, block.id, '2026-09-30'); // ativa, mas antes de `from`
      clock.set(NOON);
      await complete(user, block.id, '2026-10-07');
      await undo(user, block.id, '2026-10-07'); // desfeita

      expect((await patch(user, block.id, { from: '2026-10-07', weekday: 1 })).status).toBe(200);
    });

    it('trocar a atividade para outra ÁREA e depois desfazer devolve o XP à área ORIGINAL', async () => {
      const { user, activity, other } = await setup();
      expect(other.areaId).not.toBe(activity.areaId);
      const block = await createBlock(user, activity.id);
      await complete(user, block.id); // 60 XP na área da atividade original

      const edited = await patch(user, block.id, { from: '2026-10-07', activityId: other.id });
      expect(edited.status).toBe(200);
      const res = await undo(user, edited.body.id);

      expect(res.body).toMatchObject({ xpReverted: 60, area: { areaId: activity.areaId, xp: 0 } });
      expect(
        (await prisma.areaProgress.findUniqueOrThrow({ where: { areaId: activity.areaId } }))
          .cachedXp,
      ).toBe(0);
      expect(await prisma.areaProgress.findUnique({ where: { areaId: other.areaId } })).toBeNull();
    });

    it('bloco avulso concluído: não muda de data (409), mas pode mudar o horário', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id, {
        recurrence: 'once',
        date: '2026-10-07',
        weekday: undefined,
        validFrom: undefined,
      });
      await complete(user, block.id);

      expect((await patch(user, block.id, { from: '2026-10-07', date: '2026-10-09' })).status).toBe(
        409,
      );
      expect((await patch(user, block.id, { from: '2026-10-07', startTime: '10:00' })).status).toBe(
        200,
      );
    });

    it('editar enquanto se conclui, ao mesmo tempo, nunca deixa uma conclusão órfã', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);

      const results = await Promise.all([
        complete(user, block.id),
        patch(user, block.id, { from: '2026-10-07', startTime: '18:00' }),
      ]);

      // Qualquer ordem é válida (200, ou 404 se a série já foi dividida), mas NUNCA erro de servidor:
      // um 500 aqui era um deadlock entre as travas da pessoa e do bloco.
      for (const res of results) expect([200, 404, 409]).toContain(res.status);

      const week = (await getWeek(user, '2026-10-05')).body as {
        occurrences: { blockId: string; occurrenceDate: string }[];
        completions: { blockId: string; occurrenceDate: string }[];
      };
      const occurrenceKeys = new Set(
        week.occurrences.map((o) => `${o.blockId}|${o.occurrenceDate}`),
      );
      for (const completion of week.completions) {
        expect(occurrenceKeys.has(`${completion.blockId}|${completion.occurrenceDate}`)).toBe(true);
      }
    });
  });

  describe('excluir "esta e as próximas" com conclusões', () => {
    it('recusa excluir a partir de uma data que tem conclusão ativa (409)', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      await complete(user, block.id);

      const res = await remove(user, block.id, '2026-10-07');

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/Desfaça as conclusões/);
      expect(
        (await prisma.block.findUniqueOrThrow({ where: { id: block.id } })).validUntil,
      ).toBeNull();
    });

    it('depois de desfazer, a exclusão passa', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      await complete(user, block.id);
      await undo(user, block.id);

      expect((await remove(user, block.id, '2026-10-07')).status).toBe(204);
    });

    it('excluir a partir de uma data DEPOIS da conclusão preserva o passado e a conclusão', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      await complete(user, block.id);

      expect((await remove(user, block.id, '2026-10-14')).status).toBe(204);

      expect(
        await prisma.completion.count({ where: { userId: user.userId, undoneAt: null } }),
      ).toBe(1);
      expect((await getWeek(user, '2026-10-05')).body.completions).toHaveLength(1);
    });

    it('bloco avulso concluído não pode ser excluído (409)', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id, {
        recurrence: 'once',
        date: '2026-10-07',
        weekday: undefined,
        validFrom: undefined,
      });
      await complete(user, block.id);

      expect((await remove(user, block.id, '2026-10-07')).status).toBe(409);
      expect(await prisma.block.count({ where: { id: block.id } })).toBe(1);
    });

    it('bloco avulso com a conclusão desfeita é excluído, junto com as linhas de conclusão; o livro-caixa fica', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id, {
        recurrence: 'once',
        date: '2026-10-07',
        weekday: undefined,
        validFrom: undefined,
      });
      await complete(user, block.id);
      await undo(user, block.id);

      expect((await remove(user, block.id, '2026-10-07')).status).toBe(204);

      expect(await prisma.block.count({ where: { id: block.id } })).toBe(0);
      expect(await prisma.completion.count({ where: { userId: user.userId } })).toBe(0);
      expect(await prisma.xpTransaction.count({ where: { userId: user.userId } })).toBe(2); // +60 e o estorno -60
    });

    it('excluir a série inteira sem nenhuma conclusão continua funcionando como antes', async () => {
      const { user, activity } = await setup();
      const block = await createBlock(user, activity.id);
      expect((await remove(user, block.id, '2026-09-02')).status).toBe(204);
    });
  });

  describe('isolamento', () => {
    it('as travas e movimentações nunca tocam as conclusões de outra pessoa', async () => {
      const a = await setup();
      const b = await setup();
      const blockA = await createBlock(a.user, a.activity.id);
      const blockB = await createBlock(b.user, b.activity.id);
      await complete(a.user, blockA.id);
      await complete(b.user, blockB.id);

      await patch(a.user, blockA.id, { from: '2026-10-07', startTime: '18:00' });

      const rowsB = await prisma.completion.findMany({ where: { userId: b.user.userId } });
      expect(rowsB.map((row) => row.blockId)).toEqual([blockB.id]);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: b.user.userId } })).cachedTotalXp,
      ).toBe(60);
      void utc;
    });
  });
});
