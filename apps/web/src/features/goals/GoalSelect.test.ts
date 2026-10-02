import type { GoalStatus } from '@lifexp/shared';
import { describe, expect, it } from 'vitest';
import { linkableGoals } from './GoalSelect';
import { makeGoal } from './testing';

const goal = (id: string, status: GoalStatus) => makeGoal({ id, status });

describe('linkableGoals', () => {
  const goals = [
    goal('a', 'active'),
    goal('p', 'paused'),
    goal('c', 'completed'),
    goal('x', 'abandoned'),
  ];

  it('só metas ativas e pausadas aceitam blocos novos', () => {
    expect(linkableGoals(goals, null).map((g) => g.id)).toEqual(['a', 'p']);
  });

  it('a meta atual do bloco continua na lista mesmo se foi concluída ou abandonada', () => {
    expect(linkableGoals(goals, 'c').map((g) => g.id)).toEqual(['a', 'p', 'c']);
    expect(linkableGoals(goals, 'x').map((g) => g.id)).toEqual(['a', 'p', 'x']);
  });

  it('lista vazia continua vazia', () => {
    expect(linkableGoals([], null)).toEqual([]);
  });
});
