import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { weeklyReportSchema } from '@lifexp/shared';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  FakeClock,
  bearer,
  createTestApp,
  listActivities,
  registerUser,
  type TestUser,
} from './helpers.js';

/** Meio-dia em São Paulo (UTC-3) do dia civil dado. */
const noon = (date: string) => `${date}T15:00:00.000Z`;
const MON = '2026-10-05';
const TUE = '2026-10-06';
const WED = '2026-10-07';
const THU = '2026-10-08';
const PREV_MON = '2026-09-28';

describe('Relatório semanal (e2e, RF47)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const clock = new FakeClock(noon(WED));
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp({ clock });
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => clock.set(noon(WED)));

  const setup = async () => {
    const user = await registerUser(app);
    const activities = await listActivities(app, user);
    return { user, a: activities[0]!, b: activities[1]! };
  };
  const reportOf = async (user: TestUser, weekStart?: string) => {
    const res = await request(server())
      .get('/api/reports/weekly')
      .query(weekStart ? { weekStart } : {})
      .set(bearer(user));
    expect(res.status).toBe(200);
    return weeklyReportSchema.parse(res.body);
  };
  const onceBlock = async (
    user: TestUser,
    activityId: string,
    date: string,
    durationMin = 60,
    startTime = '09:00',
  ) => {
    const res = await request(server())
      .post('/api/blocks')
      .set(bearer(user))
      .send({ recurrence: 'once', activityId, date, startTime, durationMin });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  };
  const completeOn = async (user: TestUser, blockId: string, date: string) => {
    clock.set(noon(date));
    const res = await request(server())
      .post(`/api/blocks/${blockId}/occurrences/${date}/completion`)
      .set(bearer(user));
    expect(res.status).toBe(200);
    clock.set(noon(WED));
  };
  const undoOn = async (user: TestUser, blockId: string, date: string) => {
    clock.set(noon(date));
    const res = await request(server())
      .delete(`/api/blocks/${blockId}/occurrences/${date}/completion`)
      .set(bearer(user));
    expect(res.status).toBe(200);
    clock.set(noon(WED));
  };

  it('conta nova: zeros, todas as áreas ativas sem dados, sem quest e coringa disponível', async () => {
    const { user } = await setup();
    const report = await reportOf(user);

    expect(report.weekStart).toBe(MON);
    expect(report.weekEnd).toBe('2026-10-11');
    expect(report.blocks).toEqual({
      planned: 0,
      completed: 0,
      skipped: 0,
      open: 0,
      adherence: null,
    });
    expect(report.minutes).toBe(0);
    expect(report.xp).toEqual({ gained: 0, reverted: 0, net: 0, byArea: [] });
    expect(report.areas).toHaveLength(7);
    expect(report.areas.every((a) => a.score === null && a.planned === 0)).toBe(true);
    expect(report.quest.status).toBe('none');
    expect(report.achievements).toEqual([]);
    expect(report.goals).toEqual({ milestones: [], completed: [] });
    expect(report.streak).toMatchObject({ current: 0, best: 0 });
    expect(report.streak.joker).toEqual({ weekStart: MON, used: false, usedOn: null });
    expect(report.bestDay).toBeNull();
  });

  it('uma semana de verdade: cumprido, perdido, pulado e ainda em aberto', async () => {
    const { user, a, b } = await setup();
    const done = await onceBlock(user, a.id, MON, 90);
    await onceBlock(user, a.id, MON, 60, '11:00'); // segunda: perdido (janela fechada)
    const skipped = await onceBlock(user, b.id, MON, 60, '13:00');
    await onceBlock(user, b.id, TUE, 30); // ontem: em aberto
    await onceBlock(user, b.id, WED, 30); // hoje: em aberto
    await onceBlock(user, b.id, THU, 30); // amanhã: nem entra
    await completeOn(user, done.id, MON);
    await request(server())
      .put(`/api/blocks/${skipped.id}/exceptions/${MON}`)
      .set(bearer(user))
      .send({ type: 'skip' });

    const report = await reportOf(user);
    expect(report.blocks).toEqual({ planned: 2, completed: 1, skipped: 1, open: 2, adherence: 50 });
    expect(report.minutes).toBe(90);
    expect(report.bestDay).toEqual({ date: MON, completed: 1 });
    const byId = Object.fromEntries(report.areas.map((x) => [x.areaId, x]));
    expect(byId[a.areaId]).toMatchObject({ planned: 2, completed: 1, score: 50, minutes: 90 });
    expect(byId[b.areaId]).toMatchObject({ planned: 0, completed: 0, score: null, minutes: 0 });
  });

  it('XP: ganhos, devolvidos por desfazer e líquido, por área', async () => {
    const { user, a, b } = await setup();
    const kept = await onceBlock(user, a.id, MON, 60);
    const undone = await onceBlock(user, b.id, TUE, 60);
    await completeOn(user, kept.id, MON);
    await completeOn(user, undone.id, TUE);
    await undoOn(user, undone.id, TUE);

    const report = await reportOf(user);
    expect(report.xp.gained).toBeGreaterThan(report.xp.net);
    expect(report.xp.reverted).toBeGreaterThan(0);
    expect(report.xp.net).toBe(report.xp.gained - report.xp.reverted);
    // a área do bloco desfeito fica em zero e some; só a área do bloco mantido aparece
    expect(report.xp.byArea.map((e) => e.areaId)).toEqual([a.areaId]);
    expect(report.xp.byArea[0]!.amount).toBe(report.xp.net);
  });

  it('o bônus da quest entra em "Sem área" e a quest da semana vem no relatório', async () => {
    const { user, a } = await setup();
    const block = await onceBlock(user, a.id, WED);
    expect((await request(server()).get('/api/quest').set(bearer(user))).status).toBe(200);
    await completeOn(user, block.id, WED);

    const report = await reportOf(user);
    expect(report.quest.status).toBe('completed');
    const semArea = report.xp.byArea.find((e) => e.areaId === null);
    expect(semArea).toMatchObject({ name: 'Sem área', amount: report.quest.bonusXp });
  });

  it('conquistas e metas da semana aparecem; as de outra semana não', async () => {
    const { user, a } = await setup();
    const block = await onceBlock(user, a.id, MON);
    await completeOn(user, block.id, MON); // Primeiro passo, em 05/10
    const goal = await request(server())
      .post('/api/goals')
      .set(bearer(user))
      .send({ title: 'Meta A' });
    const ms = await request(server())
      .post(`/api/goals/${goal.body.id}/milestones`)
      .set(bearer(user))
      .send({ title: 'Marco 1' });
    await request(server())
      .post(`/api/goals/${goal.body.id}/milestones/${ms.body.milestones[0].id}/completion`)
      .set(bearer(user));
    await request(server())
      .put(`/api/goals/${goal.body.id}/status`)
      .set(bearer(user))
      .send({ status: 'completed' });

    const report = await reportOf(user);
    expect(report.achievements.map((x) => x.title)).toEqual(['Primeiro passo', 'Sonho realizado']);
    expect(report.goals.milestones).toEqual([
      expect.objectContaining({ goalTitle: 'Meta A', title: 'Marco 1' }),
    ]);
    expect(report.goals.completed).toEqual([expect.objectContaining({ title: 'Meta A' })]);

    const previous = await reportOf(user, PREV_MON);
    expect(previous.quest).toMatchObject({ weekStart: PREV_MON, status: 'none' });
    expect(previous.achievements).toEqual([]);
    expect(previous.goals).toEqual({ milestones: [], completed: [] });
    expect(previous.xp.gained).toBe(0);
  });

  it('semana passada: tudo que não foi cumprido já fechou e o streak é o do fim daquela semana', async () => {
    const { user, a } = await setup();
    const days = ['2026-09-28', '2026-09-29', '2026-09-30'];
    for (const day of days) {
      const block = await onceBlock(user, a.id, day);
      await completeOn(user, block.id, day);
    }
    await onceBlock(user, a.id, '2026-10-03'); // sábado: perdido

    const previous = await reportOf(user, PREV_MON);
    expect(previous.blocks).toEqual({
      planned: 4,
      completed: 3,
      skipped: 0,
      open: 0,
      adherence: 75,
    });
    // no domingo daquela semana o streak era 3 (sábado ainda estava em aberto; o coringa só gasta com a janela fechada)
    expect(previous.streak.current).toBe(3);
    expect(previous.streak.joker.weekStart).toBe(PREV_MON);
    // hoje (quarta 07/10) o sábado já fechou: o coringa daquela semana o perdoou, a sequência segue em 3
    const current = await reportOf(user);
    expect(current.streak.current).toBe(3);
    expect(current.streak.joker.weekStart).toBe(MON);
  });

  it('o XP é da semana no fuso da pessoa: domingo à noite local ainda é desta semana', async () => {
    const { user, a } = await setup();
    await request(server())
      .patch('/api/users/me')
      .set(bearer(user))
      .send({ timezone: 'America/Sao_Paulo' });
    const block = await onceBlock(user, a.id, '2026-10-11', 60, '21:00');
    // 23:30 de domingo em São Paulo = 02:30 de segunda em UTC
    clock.set('2026-10-12T02:30:00.000Z');
    const done = await request(server())
      .post(`/api/blocks/${block.id}/occurrences/2026-10-11/completion`)
      .set(bearer(user));
    expect(done.status).toBe(200);

    clock.set('2026-10-14T15:00:00.000Z');
    const report = await reportOf(user, MON);
    expect(report.xp.gained).toBeGreaterThan(0);
    const next = await reportOf(user, '2026-10-12');
    expect(next.xp.gained).toBe(0);
  });

  it('semana futura: 400; semana que não é segunda-feira ou data inválida: 400', async () => {
    const { user } = await setup();
    for (const weekStart of ['2026-10-12', '2026-10-06', '2026-02-30', 'abc']) {
      const res = await request(server())
        .get('/api/reports/weekly')
        .query({ weekStart })
        .set(bearer(user));
      expect(res.status).toBe(400);
    }
  });

  it('é de cada pessoa: o relatório de uma não enxerga os dados da outra', async () => {
    const { user: ana, a } = await setup();
    const { user: bia } = await setup();
    const block = await onceBlock(ana, a.id, MON);
    await completeOn(ana, block.id, MON);

    // a Bia também cumpre um marco e uma meta na mesma semana
    const goal = await request(server())
      .post('/api/goals')
      .set(bearer(bia))
      .send({ title: 'Meta da Bia' });
    const ms = await request(server())
      .post(`/api/goals/${goal.body.id}/milestones`)
      .set(bearer(bia))
      .send({ title: 'Marco da Bia' });
    await request(server())
      .post(`/api/goals/${goal.body.id}/milestones/${ms.body.milestones[0].id}/completion`)
      .set(bearer(bia));
    await request(server())
      .put(`/api/goals/${goal.body.id}/status`)
      .set(bearer(bia))
      .send({ status: 'completed' });

    const mine = await reportOf(ana);
    expect(mine.blocks.completed).toBe(1);
    expect(mine.goals).toEqual({ milestones: [], completed: [] });
    expect(mine.areas.map((x) => x.areaId)).not.toContain((await reportOf(bia)).areas[0]!.areaId);
    expect(mine.areas).toHaveLength(7);
    const other = await reportOf(bia);
    expect(other.goals.milestones).toHaveLength(1);
    expect(other.blocks).toEqual({
      planned: 0,
      completed: 0,
      skipped: 0,
      open: 0,
      adherence: null,
    });
    // só o XP e a conquista da própria Bia (marco 100 + meta 500), nada do bloco da Ana
    expect(other.xp.gained).toBe(600);
    expect(other.achievements.map((x) => x.title)).toEqual(['Sonho realizado']);
  });

  describe('em Markdown', () => {
    it('baixa como arquivo, com a semana no nome, sem cache', async () => {
      const { user, a } = await setup();
      const block = await onceBlock(user, a.id, MON);
      await completeOn(user, block.id, MON);

      const res = await request(server()).get('/api/reports/weekly.md').set(bearer(user));
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/markdown');
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="lifexp-relatorio-2026-10-05.md"',
      );
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.text).toContain('# Relatório da semana de 05/10 a 11/10/2026');
      expect(res.text).toContain('- **Blocos:** 1 de 1 cumpridos (100% de aderência).');
    });

    it('aceita a semana pedida e escapa o texto da pessoa', async () => {
      const { user, a } = await setup();
      const goal = await request(server())
        .post('/api/goals')
        .set(bearer(user))
        .send({ title: 'Meta [com] *marcação*' });
      const ms = await request(server())
        .post(`/api/goals/${goal.body.id}/milestones`)
        .set(bearer(user))
        .send({ title: 'Marco' });
      await request(server())
        .post(`/api/goals/${goal.body.id}/milestones/${ms.body.milestones[0].id}/completion`)
        .set(bearer(user));
      void a;

      const res = await request(server())
        .get('/api/reports/weekly.md')
        .query({ weekStart: MON })
        .set(bearer(user));
      expect(res.text).toContain('Marco concluído: Marco (Meta \\[com\\] \\*marcação\\*)');
      expect(res.text).not.toContain('[com]');

      const previous = await request(server())
        .get('/api/reports/weekly.md')
        .query({ weekStart: PREV_MON })
        .set(bearer(user));
      expect(previous.headers['content-disposition']).toContain('lifexp-relatorio-2026-09-28.md');
    });

    it('semana futura dá 400 também em Markdown', async () => {
      const { user } = await setup();
      const res = await request(server())
        .get('/api/reports/weekly.md')
        .query({ weekStart: '2026-10-12' })
        .set(bearer(user));
      expect(res.status).toBe(400);
    });
  });

  it('exige autenticação', async () => {
    expect((await request(server()).get('/api/reports/weekly')).status).toBe(401);
    expect((await request(server()).get('/api/reports/weekly.md')).status).toBe(401);
    void prisma;
  });
});
