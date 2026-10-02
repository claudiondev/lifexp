import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ACHIEVEMENT_KEYS, achievementListSchema, completionResultSchema } from '@lifexp/shared';
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
const WED = '2026-10-07';
const day = (n: number, month = '09') => `2026-${month}-${String(n).padStart(2, '0')}`;

describe('Conquistas (e2e, RF23)', () => {
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
    return { user, activities };
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
  /** Conclui estando "no dia" (meio-dia em São Paulo) e devolve o resultado já no contrato. */
  const completeOn = async (user: TestUser, blockId: string, date: string) => {
    clock.set(noon(date));
    const res = await request(server())
      .post(`/api/blocks/${blockId}/occurrences/${date}/completion`)
      .set(bearer(user));
    expect(res.status).toBe(200);
    clock.set(noon(WED));
    return completionResultSchema.parse(res.body);
  };
  const achievementsOf = async (user: TestUser) => {
    const res = await request(server()).get('/api/achievements').set(bearer(user));
    expect(res.status).toBe(200);
    return achievementListSchema.parse(res.body);
  };
  const unlockedKeys = async (user: TestUser) =>
    (await achievementsOf(user)).filter((a) => a.unlocked).map((a) => a.key);

  it('conta nova: o catálogo inteiro, tudo bloqueado, com barra zerada nas numéricas', async () => {
    const { user } = await setup();
    const list = await achievementsOf(user);

    expect(list.map((a) => a.key)).toEqual([...ACHIEVEMENT_KEYS]);
    expect(list.every((a) => !a.unlocked && a.unlockedAt === null)).toBe(true);
    const byKey = Object.fromEntries(list.map((a) => [a.key, a]));
    expect(byKey['constant']!.progress).toEqual({ current: 0, target: 7 });
    expect(byKey['unshakeable']!.progress).toEqual({ current: 0, target: 30 });
    expect(byKey['hundred_hours']!.progress).toEqual({ current: 0, target: 6000 });
    expect(byKey['deserved_rest']!.progress).toEqual({ current: 0, target: 10 });
    expect(byKey['first_step']!.progress).toBeNull();
    expect(byKey['first_step']!.title).toBe('Primeiro passo');
  });

  it('Primeiro passo: o primeiro bloco cumprido desbloqueia, e só na primeira vez', async () => {
    const { user, activities } = await setup();
    const a = await onceBlock(user, activities[0]!.id, '2026-10-05');
    const b = await onceBlock(user, activities[0]!.id, '2026-10-06');

    expect((await completeOn(user, a.id, '2026-10-05')).achievementsUnlocked).toEqual([
      'first_step',
    ]);
    expect((await completeOn(user, b.id, '2026-10-06')).achievementsUnlocked).toEqual([]);
    expect(await unlockedKeys(user)).toEqual(['first_step']);
    const unlocked = (await achievementsOf(user)).find((x) => x.key === 'first_step')!;
    expect(unlocked.unlockedAt).toBe(noon('2026-10-05'));
  });

  it('concluir de novo (idempotente) não desbloqueia nada de novo', async () => {
    const { user, activities } = await setup();
    const a = await onceBlock(user, activities[0]!.id, '2026-10-05');
    await completeOn(user, a.id, '2026-10-05');
    const again = await completeOn(user, a.id, '2026-10-05');
    expect(again.alreadyCompleted).toBe(true);
    expect(again.achievementsUnlocked).toEqual([]);
  });

  it('é permanente: desfazer a conclusão não retira a conquista', async () => {
    const { user, activities } = await setup();
    const a = await onceBlock(user, activities[0]!.id, '2026-10-06');
    await completeOn(user, a.id, '2026-10-06');
    clock.set(noon('2026-10-06'));
    const undo = await request(server())
      .delete(`/api/blocks/${a.id}/occurrences/2026-10-06/completion`)
      .set(bearer(user));
    expect(undo.status).toBe(200);

    expect(await unlockedKeys(user)).toEqual(['first_step']);
    // e refazer não a "desbloqueia" outra vez
    expect((await completeOn(user, a.id, '2026-10-06')).achievementsUnlocked).toEqual([]);
  });

  it('Constante (7 dias) e Inabalável (30 dias): desbloqueiam no dia certo, nem antes', async () => {
    const { user, activities } = await setup();
    const at = new Map<string, string>();
    // 30 dias seguidos, de 01/09 a 30/09, um bloco por dia
    for (let n = 1; n <= 30; n++) {
      const block = await onceBlock(user, activities[0]!.id, day(n));
      const result = await completeOn(user, block.id, day(n));
      for (const key of result.achievementsUnlocked) at.set(key, day(n));
    }
    expect(at.get('first_step')).toBe(day(1));
    expect(at.get('constant')).toBe(day(7));
    expect(at.get('unshakeable')).toBe(day(30));
    expect((await achievementsOf(user)).find((a) => a.key === 'constant')!.progress).toEqual({
      current: 7,
      target: 7,
    });
  }, 120_000);

  it('o progresso do streak aparece na lista antes de desbloquear', async () => {
    const { user, activities } = await setup();
    for (let n = 1; n <= 3; n++) {
      const block = await onceBlock(user, activities[0]!.id, day(n));
      await completeOn(user, block.id, day(n));
    }
    const list = await achievementsOf(user);
    expect(list.find((a) => a.key === 'constant')).toMatchObject({
      unlocked: false,
      progress: { current: 3, target: 7 },
    });
  });

  it('100 horas: soma 6.000 minutos cumpridos numa MESMA área, e só ali', async () => {
    const { user, activities } = await setup();
    const unlockedAt = new Map<string, number>();
    // 9 blocos de 12 h (720 min) em dias diferentes: 8 = 5.760 min, o 9º passa de 6.000
    for (let n = 1; n <= 9; n++) {
      const block = await onceBlock(user, activities[0]!.id, day(n), 720);
      const result = await completeOn(user, block.id, day(n));
      if (result.achievementsUnlocked.includes('hundred_hours')) unlockedAt.set('hundred_hours', n);
    }
    expect(unlockedAt.get('hundred_hours')).toBe(9);
  }, 120_000);

  it('100 horas em áreas diferentes não soma: precisa ser a mesma área', async () => {
    const { user, activities } = await setup();
    for (let n = 1; n <= 9; n++) {
      const activity = activities[n % 2]!; // alterna entre duas áreas
      const block = await onceBlock(user, activity.id, day(n), 720);
      const result = await completeOn(user, block.id, day(n));
      expect(result.achievementsUnlocked).not.toContain('hundred_hours');
    }
    const progress = (await achievementsOf(user)).find((a) => a.key === 'hundred_hours')!.progress;
    expect(progress!.current).toBe(720 * 5); // a área com mais blocos (5 de 9)
  }, 120_000);

  it('Descanso merecido: 10 blocos da área Descanso (o 9º ainda não)', async () => {
    const { user, activities } = await setup();
    const areas = await request(server()).get('/api/areas').set(bearer(user));
    const rest = (areas.body as { id: string; name: string }[]).find((a) => a.name === 'Descanso')!;
    const restActivity = activities.find((a) => a.areaId === rest.id)!;
    const other = activities.find((a) => a.areaId !== rest.id)!;

    // 3 blocos de outra área não contam
    for (let n = 20; n < 23; n++) {
      const block = await onceBlock(user, other.id, day(n));
      expect((await completeOn(user, block.id, day(n))).achievementsUnlocked).not.toContain(
        'deserved_rest',
      );
    }
    for (let n = 1; n <= 10; n++) {
      const block = await onceBlock(user, restActivity.id, day(n));
      const result = await completeOn(user, block.id, day(n));
      expect(result.achievementsUnlocked.includes('deserved_rest')).toBe(n === 10);
    }
  }, 120_000);

  it('Sonho realizado: concluir a primeira meta desbloqueia e aparece na resposta da meta', async () => {
    const { user } = await setup();
    const goal = await request(server())
      .post('/api/goals')
      .set(bearer(user))
      .send({ title: 'Escrever o livro' });
    expect(goal.status).toBe(201);

    const done = await request(server())
      .put(`/api/goals/${goal.body.id}/status`)
      .set(bearer(user))
      .send({ status: 'completed' });
    expect(done.status).toBe(200);
    expect(done.body.achievementsUnlocked).toEqual(['dream_realized']);
    expect(await unlockedKeys(user)).toEqual(['dream_realized']);

    // reabrir e concluir de novo não repete (nem retira)
    await request(server())
      .put(`/api/goals/${goal.body.id}/status`)
      .set(bearer(user))
      .send({ status: 'active' });
    expect(await unlockedKeys(user)).toEqual(['dream_realized']);
    const again = await request(server())
      .put(`/api/goals/${goal.body.id}/status`)
      .set(bearer(user))
      .send({ status: 'completed' });
    expect(again.body.achievementsUnlocked).toEqual([]);
  });

  it('Semana completa: cumprir a quest semanal desbloqueia junto com o bônus', async () => {
    const { user, activities } = await setup();
    const block = await onceBlock(user, activities[0]!.id, '2026-10-07');
    // a primeira consulta da semana tira o snapshot
    clock.set(noon(WED));
    expect((await request(server()).get('/api/quest').set(bearer(user))).status).toBe(200);

    const result = await completeOn(user, block.id, WED);
    expect(result.questBonusXp).toBeGreaterThan(0);
    expect(result.achievementsUnlocked).toEqual(['first_step', 'full_week']);
  });

  it('Equilibrado: todas as áreas ativas cumprindo o mínimo na mesma semana', async () => {
    const { user, activities } = await setup();
    // um bloco por área na semana de 05/10 a 11/10
    const blocks = [];
    for (const [i, activity] of activities.entries()) {
      blocks.push(
        await onceBlock(
          user,
          activity.id,
          `2026-10-${String(5 + (i % 5)).padStart(2, '0')}`,
          60,
          `0${i + 1}:00`,
        ),
      );
    }
    const found: string[] = [];
    for (const [i, block] of blocks.entries()) {
      const date = `2026-10-${String(5 + (i % 5)).padStart(2, '0')}`;
      const result = await completeOn(user, block.id, date);
      found.push(...result.achievementsUnlocked);
      // só o último bloco completa o equilíbrio
      expect(result.achievementsUnlocked.includes('balanced')).toBe(i === blocks.length - 1);
    }
    expect(found).toContain('balanced');
  }, 120_000);

  it('Equilibrado não vale com uma área de fora da semana (planejada e não cumprida)', async () => {
    const { user, activities } = await setup();
    for (const [i, activity] of activities.entries()) {
      const date = `2026-10-${String(5 + (i % 5)).padStart(2, '0')}`;
      const block = await onceBlock(user, activity.id, date, 60, `0${i + 1}:00`);
      if (i < activities.length - 1) await completeOn(user, block.id, date);
    }
    expect(await unlockedKeys(user)).not.toContain('balanced');
  }, 120_000);

  it('quest ainda não cumprida não desbloqueia "Semana completa"', async () => {
    const { user, activities } = await setup();
    const a = await onceBlock(user, activities[0]!.id, '2026-10-06');
    await onceBlock(user, activities[0]!.id, '2026-10-07', 60, '10:00');
    expect((await request(server()).get('/api/quest').set(bearer(user))).status).toBe(200);

    // 1 de 2 blocos: abaixo dos 80%
    const result = await completeOn(user, a.id, '2026-10-06');
    expect(result.questBonusXp).toBe(0);
    expect(result.achievementsUnlocked).toEqual(['first_step']);
  });

  it('cumprir a quest ao CONSULTÁ-LA (pulou um bloco) também desbloqueia "Semana completa"', async () => {
    const { user, activities } = await setup();
    const a = await onceBlock(user, activities[0]!.id, '2026-10-06');
    const b = await onceBlock(user, activities[0]!.id, '2026-10-07', 60, '10:00');
    expect((await request(server()).get('/api/quest').set(bearer(user))).status).toBe(200);
    await completeOn(user, a.id, '2026-10-06'); // 1 de 2: ainda não

    const skipped = await request(server())
      .put(`/api/blocks/${b.id}/exceptions/2026-10-07`)
      .set(bearer(user))
      .send({ type: 'skip' });
    expect(skipped.status).toBe(200);
    expect((await unlockedKeys(user)).includes('full_week')).toBe(false);

    const quest = await request(server()).get('/api/quest').set(bearer(user));
    expect(quest.body.status).toBe('completed');
    expect(await unlockedKeys(user)).toContain('full_week');
  });

  it('uma meta ainda ativa não desbloqueia "Sonho realizado"', async () => {
    const { user, activities } = await setup();
    await request(server()).post('/api/goals').set(bearer(user)).send({ title: 'Em andamento' });
    const block = await onceBlock(user, activities[0]!.id, '2026-10-05');

    expect((await completeOn(user, block.id, '2026-10-05')).achievementsUnlocked).toEqual([
      'first_step',
    ]);
  });

  it('conclusões desfeitas não contam para as 100 horas', async () => {
    const { user, activities } = await setup();
    const blocks = [];
    for (let n = 1; n <= 9; n++) blocks.push(await onceBlock(user, activities[0]!.id, day(n), 720));
    for (let n = 1; n <= 8; n++) await completeOn(user, blocks[n - 1]!.id, day(n)); // 5.760 min
    // um 9º concluído e desfeito (dentro da janela) e a conquista "perdida" por uma conta antiga
    clock.set(noon(day(9)));
    const url = `/api/blocks/${blocks[8]!.id}/occurrences/${day(9)}/completion`;
    expect((await request(server()).post(url).set(bearer(user))).status).toBe(200);
    expect((await request(server()).delete(url).set(bearer(user))).status).toBe(200);
    await prisma.achievement.deleteMany({ where: { userId: user.userId, key: 'hundred_hours' } });

    // um bloco curto: 5.760 + 60 < 6.000 (com o desfeito somado, passaria)
    const extra = await onceBlock(user, activities[0]!.id, '2026-10-05', 60);
    const result = await completeOn(user, extra.id, '2026-10-05');
    expect(result.achievementsUnlocked).not.toContain('hundred_hours');
  }, 120_000);

  it('conclusões desfeitas não contam para "Descanso merecido"', async () => {
    const { user, activities } = await setup();
    const areas = await request(server()).get('/api/areas').set(bearer(user));
    const rest = (areas.body as { id: string; name: string }[]).find((a) => a.name === 'Descanso')!;
    const restActivity = activities.find((a) => a.areaId === rest.id)!;
    const blocks = [];
    for (let n = 1; n <= 9; n++) blocks.push(await onceBlock(user, restActivity.id, day(n)));
    for (let n = 1; n <= 8; n++) await completeOn(user, blocks[n - 1]!.id, day(n)); // 8 ativas
    // o 9º concluído e desfeito, e a conquista "perdida" por uma conta antiga
    clock.set(noon(day(9)));
    const url = `/api/blocks/${blocks[8]!.id}/occurrences/${day(9)}/completion`;
    expect((await request(server()).post(url).set(bearer(user))).status).toBe(200);
    expect((await request(server()).delete(url).set(bearer(user))).status).toBe(200);
    await prisma.achievement.deleteMany({ where: { userId: user.userId, key: 'deserved_rest' } });

    // mais uma: 8 + 1 = 9 ativas (com a desfeita somada seriam 10)
    const extra = await onceBlock(user, restActivity.id, '2026-10-05');
    const result = await completeOn(user, extra.id, '2026-10-05');
    expect(result.achievementsUnlocked).not.toContain('deserved_rest');
  }, 120_000);

  it('conclusões desfeitas não contam para o "Primeiro passo" (avaliado por outra via: um marco)', async () => {
    const { user, activities } = await setup();
    const block = await onceBlock(user, activities[0]!.id, '2026-10-06');
    await completeOn(user, block.id, '2026-10-06');
    clock.set(noon('2026-10-06'));
    const url = `/api/blocks/${block.id}/occurrences/2026-10-06/completion`;
    expect((await request(server()).delete(url).set(bearer(user))).status).toBe(200);
    await prisma.achievement.deleteMany({ where: { userId: user.userId } });

    const goal = await request(server())
      .post('/api/goals')
      .set(bearer(user))
      .send({ title: 'Meta' });
    const milestone = await request(server())
      .post(`/api/goals/${goal.body.id}/milestones`)
      .set(bearer(user))
      .send({ title: 'Marco' });
    const done = await request(server())
      .post(`/api/goals/${goal.body.id}/milestones/${milestone.body.milestones[0].id}/completion`)
      .set(bearer(user));
    expect(done.status).toBe(200);
    expect(done.body.achievementsUnlocked).toEqual([]);
  });

  it('o streak é avaliado mesmo quando "Equilibrado" já foi conquistada', async () => {
    const { user, activities } = await setup();
    await prisma.achievement.create({
      data: { userId: user.userId, key: 'balanced', unlockedAt: new Date(noon(WED)) },
    });
    let constantAt = 0;
    for (let n = 1; n <= 7; n++) {
      const block = await onceBlock(user, activities[0]!.id, day(n));
      const result = await completeOn(user, block.id, day(n));
      if (result.achievementsUnlocked.includes('constant')) constantAt = n;
    }
    expect(constantAt).toBe(7);
  }, 120_000);

  it('Equilibrado: área arquivada não conta como "ativa" e não atrapalha', async () => {
    const { user, activities } = await setup();
    const archived = await request(server())
      .post(`/api/areas/${activities[0]!.areaId}/archive`)
      .set(bearer(user));
    expect(archived.status).toBeLessThan(300);
    const active = activities.filter((a) => a.areaId !== activities[0]!.areaId);

    let last: string[] = [];
    for (const [i, activity] of active.entries()) {
      const date = `2026-10-${String(5 + (i % 5)).padStart(2, '0')}`;
      const block = await onceBlock(user, activity.id, date, 60, `0${i + 1}:00`);
      last = (await completeOn(user, block.id, date)).achievementsUnlocked;
    }
    expect(last).toContain('balanced');
  }, 120_000);

  it('o que já foi merecido antes é recuperado na próxima ação (retroativo)', async () => {
    const { user, activities } = await setup();
    const block = await onceBlock(user, activities[0]!.id, '2026-10-05');
    await completeOn(user, block.id, '2026-10-05');
    // simula uma conta antiga: a conquista não foi gravada
    await prisma.achievement.deleteMany({ where: { userId: user.userId } });
    const next = await onceBlock(user, activities[0]!.id, '2026-10-06');
    expect((await completeOn(user, next.id, '2026-10-06')).achievementsUnlocked).toEqual([
      'first_step',
    ]);
  });

  it('é de cada pessoa: a conquista de uma conta não aparece na outra', async () => {
    const { user: ana, activities } = await setup();
    const { user: bia } = await setup();
    const block = await onceBlock(ana, activities[0]!.id, '2026-10-05');
    await completeOn(ana, block.id, '2026-10-05');

    expect(await unlockedKeys(ana)).toEqual(['first_step']);
    expect(await unlockedKeys(bia)).toEqual([]);
  });

  it('exige autenticação', async () => {
    expect((await request(server()).get('/api/achievements')).status).toBe(401);
  });
});
