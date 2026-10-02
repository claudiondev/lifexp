import type { Goal, GoalActionResult } from '@lifexp/shared';

/** Apoio dos testes de metas: meta de exemplo e respostas no formato da API. */
export const GOAL_ID = '0192f1a0-7b3c-7000-8000-0000000000c1';
export const AREA_ID = '0192f1a0-7b3c-7000-8000-0000000000b1';
export const MS_1 = '0192f1a0-7b3c-7000-8000-0000000000d1';
export const MS_2 = '0192f1a0-7b3c-7000-8000-0000000000d2';

export const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const level = (xp: number, lvl: number) => ({
  xp,
  level: lvl,
  xpIntoLevel: 10,
  xpForNextLevel: 183,
  progress: 0.05,
});

export function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: GOAL_ID,
    areaId: AREA_ID,
    title: 'Ler 12 livros',
    description: null,
    deadline: null,
    status: 'active',
    unit: null,
    targetValue: null,
    currentValue: null,
    completedAt: null,
    overdue: false,
    progress: { ratio: 0.5, source: 'milestones' },
    readyToComplete: false,
    milestones: [
      {
        id: MS_1,
        title: 'Primeiro livro',
        done: true,
        doneAt: '2026-10-07T15:00:00.000Z',
        position: 0,
      },
      { id: MS_2, title: 'Segundo livro', done: false, doneAt: null, position: 1 },
    ],
    investedMinutes: 90,
    ...overrides,
  };
}

export function makeResult(
  goal: Goal,
  xpDelta: number,
  levels: [number, number] = [2, 2],
): GoalActionResult {
  return {
    goal,
    xpDelta,
    levelBefore: levels[0],
    levelAfter: levels[1],
    total: level(300, levels[1]),
  };
}

export const AREAS = [
  {
    id: AREA_ID,
    name: 'Estudo',
    color: 'sky',
    icon: 'book-open',
    position: 0,
    archivedAt: null,
  },
];
