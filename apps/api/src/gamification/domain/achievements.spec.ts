import type { AchievementKey, Occurrence } from '@lifexp/shared';
import { describe, expect, it } from 'vitest';
import {
  achievementProgress,
  isBalancedWeek,
  isRestArea,
  isRewardReached,
  newlyUnlocked,
  type AchievementFacts,
} from './achievements.js';

const NONE: AchievementFacts = {
  completionCount: 0,
  questCompletedCount: 0,
  bestStreak: 0,
  maxAreaMinutes: 0,
  restCount: 0,
  completedGoalCount: 0,
  balancedWeekReached: false,
};
const facts = (over: Partial<AchievementFacts>): AchievementFacts => ({ ...NONE, ...over });
const unlocked = (...keys: AchievementKey[]) => new Set(keys);

describe('newlyUnlocked', () => {
  it('sem nada feito, nada a desbloquear', () => {
    expect(newlyUnlocked(NONE, unlocked())).toEqual([]);
  });

  it('cada conquista tem o seu gatilho (e só o dela)', () => {
    const cases: [Partial<AchievementFacts>, AchievementKey][] = [
      [{ completionCount: 1 }, 'first_step'],
      [{ questCompletedCount: 1 }, 'full_week'],
      [{ bestStreak: 7 }, 'constant'],
      [{ bestStreak: 30 }, 'unshakeable'],
      [{ balancedWeekReached: true }, 'balanced'],
      [{ maxAreaMinutes: 6000 }, 'hundred_hours'],
      [{ completedGoalCount: 1 }, 'dream_realized'],
      [{ restCount: 10 }, 'deserved_rest'],
    ];
    for (const [over, key] of cases) {
      const got = newlyUnlocked(facts(over), unlocked());
      expect(got).toContain(key);
    }
    expect(newlyUnlocked(facts({ completionCount: 5 }), unlocked())).toEqual(['first_step']);
    expect(newlyUnlocked(facts({ restCount: 10 }), unlocked())).toEqual(['deserved_rest']);
  });

  it('os limiares são "pelo menos": um a menos não basta', () => {
    expect(newlyUnlocked(facts({ bestStreak: 6 }), unlocked())).toEqual([]);
    expect(newlyUnlocked(facts({ bestStreak: 29 }), unlocked())).toEqual(['constant']);
    expect(newlyUnlocked(facts({ maxAreaMinutes: 5999 }), unlocked())).toEqual([]);
    expect(newlyUnlocked(facts({ restCount: 9 }), unlocked())).toEqual([]);
  });

  it('streak de 30 desbloqueia as duas, na ordem do catálogo', () => {
    expect(newlyUnlocked(facts({ bestStreak: 30 }), unlocked())).toEqual([
      'constant',
      'unshakeable',
    ]);
  });

  it('o que a pessoa já tem não volta a ser desbloqueado', () => {
    expect(
      newlyUnlocked(facts({ completionCount: 3, bestStreak: 7 }), unlocked('first_step')),
    ).toEqual(['constant']);
  });
});

describe('achievementProgress', () => {
  it('mede em números as conquistas numéricas e limita ao alvo', () => {
    expect(achievementProgress('constant', facts({ bestStreak: 3 }))).toEqual({
      current: 3,
      target: 7,
    });
    expect(achievementProgress('unshakeable', facts({ bestStreak: 12 }))).toEqual({
      current: 12,
      target: 30,
    });
    expect(achievementProgress('hundred_hours', facts({ maxAreaMinutes: 9000 }))).toEqual({
      current: 6000,
      target: 6000,
    });
    expect(achievementProgress('deserved_rest', facts({ restCount: 4 }))).toEqual({
      current: 4,
      target: 10,
    });
  });

  it('as conquistas de "uma vez só" não têm barra', () => {
    for (const key of ['first_step', 'full_week', 'balanced', 'dream_realized'] as const) {
      expect(achievementProgress(key, NONE)).toBeNull();
    }
  });
});

describe('isRestArea', () => {
  it('reconhece a área Descanso sem se importar com caixa ou espaços', () => {
    expect(isRestArea('Descanso')).toBe(true);
    expect(isRestArea('  descanso ')).toBe(true);
    expect(isRestArea('DESCANSO')).toBe(true);
  });

  it('outras áreas não são descanso', () => {
    expect(isRestArea('Trabalho')).toBe(false);
    expect(isRestArea('Descansos')).toBe(false);
    expect(isRestArea('')).toBe(false);
  });
});

describe('isBalancedWeek', () => {
  const WEEK = '2026-10-05';
  let seq = 0;
  const occ = (
    areaId: string,
    date = '2026-10-06',
    over: Partial<Occurrence> = {},
  ): Occurrence => ({
    blockId: `b${seq++}`,
    occurrenceDate: date,
    date,
    startTime: '09:00',
    durationMin: 60,
    activityId: 'a',
    areaId,
    goalId: null,
    note: null,
    recurrence: 'once',
    skipped: false,
    modified: false,
    ...over,
  });
  const done = (...list: Occurrence[]) =>
    new Set(list.map((o) => `${o.blockId}|${o.occurrenceDate}`));

  it('todas as áreas ativas com bloco e o mínimo cumprido: equilibrada', () => {
    const a = occ('A');
    const b = occ('B');
    expect(isBalancedWeek([a, b], done(a, b), ['A', 'B'], WEEK)).toBe(true);
  });

  it('uma área sem nenhum bloco planejado na semana quebra o equilíbrio', () => {
    const a = occ('A');
    expect(isBalancedWeek([a], done(a), ['A', 'B'], WEEK)).toBe(false);
  });

  it('uma área sem nada cumprido quebra o equilíbrio', () => {
    const a = occ('A');
    const b = occ('B');
    expect(isBalancedWeek([a, b], done(a), ['A', 'B'], WEEK)).toBe(false);
  });

  it('exige 80% por área: 4 de 5 vale, 3 de 5 não', () => {
    const five = Array.from({ length: 5 }, () => occ('A'));
    const b = occ('B');
    expect(isBalancedWeek([...five, b], done(...five.slice(0, 4), b), ['A', 'B'], WEEK)).toBe(true);
    expect(isBalancedWeek([...five, b], done(...five.slice(0, 3), b), ['A', 'B'], WEEK)).toBe(
      false,
    );
  });

  it('o que foi pulado sai da conta (RN11): a área só com pulado fica sem bloco', () => {
    const a = occ('A');
    const skipped = occ('B', '2026-10-06', { skipped: true });
    expect(isBalancedWeek([a, skipped], done(a), ['A', 'B'], WEEK)).toBe(false);
    const b = occ('B');
    expect(isBalancedWeek([a, skipped, b], done(a, b), ['A', 'B'], WEEK)).toBe(true);
  });

  it('só conta a semana pedida: o domingo anterior e a segunda seguinte ficam de fora', () => {
    const early = occ('A', '2026-10-04'); // domingo anterior
    const late = occ('B', '2026-10-12'); // segunda seguinte
    const first = occ('A', '2026-10-05');
    const last = occ('B', '2026-10-11');
    // o fim da semana: B só tem bloco na segunda seguinte
    expect(isBalancedWeek([first, late], done(first, late), ['A', 'B'], WEEK)).toBe(false);
    // o começo da semana: A só tem bloco no domingo anterior
    expect(isBalancedWeek([early, last], done(early, last), ['A', 'B'], WEEK)).toBe(false);
    // segunda a domingo da semana valem
    expect(isBalancedWeek([first, last], done(first, last), ['A', 'B'], WEEK)).toBe(true);
  });

  it('a conclusão se liga pela data ORIGINAL da ocorrência, mesmo que ela tenha sido movida', () => {
    const moved = occ('A', '2026-10-08', { occurrenceDate: '2026-09-30', modified: true });
    const b = occ('B');
    expect(
      isBalancedWeek(
        [moved, b],
        new Set([`${moved.blockId}|2026-09-30`, `${b.blockId}|${b.occurrenceDate}`]),
        ['A', 'B'],
        WEEK,
      ),
    ).toBe(true);
    // a data nova não identifica a conclusão
    expect(
      isBalancedWeek(
        [moved, b],
        new Set([`${moved.blockId}|2026-10-08`, `${b.blockId}|${b.occurrenceDate}`]),
        ['A', 'B'],
        WEEK,
      ),
    ).toBe(false);
  });

  it('área arquivada (fora da lista de ativas) não atrapalha nem ajuda', () => {
    const a = occ('A');
    const b = occ('B');
    const gone = occ('GONE');
    expect(isBalancedWeek([a, b, gone], done(a, b), ['A', 'B'], WEEK)).toBe(true);
  });

  it('com menos de 2 áreas ativas não há equilíbrio a medir', () => {
    const a = occ('A');
    expect(isBalancedWeek([a], done(a), ['A'], WEEK)).toBe(false);
    expect(isBalancedWeek([], done(), [], WEEK)).toBe(false);
  });
});

describe('isRewardReached', () => {
  const base = { level: 5, totalXp: 1200, bestStreak: 10, unlocked: unlocked('first_step') };

  it('nível, XP e streak são "pelo menos"', () => {
    expect(isRewardReached({ type: 'level', threshold: 5 }, base)).toBe(true);
    expect(isRewardReached({ type: 'level', threshold: 6 }, base)).toBe(false);
    expect(isRewardReached({ type: 'total_xp', threshold: 1200 }, base)).toBe(true);
    expect(isRewardReached({ type: 'total_xp', threshold: 1201 }, base)).toBe(false);
    expect(isRewardReached({ type: 'streak', threshold: 10 }, base)).toBe(true);
    expect(isRewardReached({ type: 'streak', threshold: 11 }, base)).toBe(false);
  });

  it('conquista é "tem": só a desbloqueada serve', () => {
    expect(isRewardReached({ type: 'achievement', achievementKey: 'first_step' }, base)).toBe(true);
    expect(isRewardReached({ type: 'achievement', achievementKey: 'constant' }, base)).toBe(false);
  });
});
