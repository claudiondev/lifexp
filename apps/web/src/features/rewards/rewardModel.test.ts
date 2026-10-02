import { describe, expect, it } from 'vitest';
import type { Reward } from '@lifexp/shared';
import { describeTrigger, groupByStatus } from './rewardModel';

const reward = (id: string, status: Reward['status']): Reward => ({
  id: `0192f1a0-7b3c-7000-8000-00000000000${id}`,
  title: `R${id}`,
  description: null,
  trigger: { type: 'level', threshold: 5 },
  status,
  reachedAt: null,
  redeemedAt: null,
  createdAt: '2026-10-07T12:00:00.000Z',
});

describe('describeTrigger', () => {
  it('descreve cada tipo de gatilho', () => {
    expect(describeTrigger({ type: 'level', threshold: 5 })).toBe('Ao chegar ao nível 5');
    expect(describeTrigger({ type: 'total_xp', threshold: 2000 })).toBe('Ao somar 2000 XP');
    expect(describeTrigger({ type: 'streak', threshold: 7 })).toBe('Ao alcançar 7 dias de streak');
    expect(describeTrigger({ type: 'streak', threshold: 1 })).toBe('Ao alcançar 1 dia de streak');
    expect(describeTrigger({ type: 'achievement', achievementKey: 'constant' })).toBe(
      'Ao desbloquear a conquista “Constante”',
    );
  });
});

describe('groupByStatus', () => {
  it('prontas primeiro, depois em andamento e por fim as resgatadas, mantendo a ordem de cada grupo', () => {
    const groups = groupByStatus([
      reward('1', 'locked'),
      reward('2', 'redeemed'),
      reward('3', 'available'),
      reward('4', 'locked'),
    ]);
    expect(groups.map((g) => [g.heading, g.rewards.map((r) => r.title)])).toEqual([
      ['Prontas para resgatar', ['R3']],
      ['Em andamento', ['R1', 'R4']],
      ['Já resgatadas', ['R2']],
    ]);
  });

  it('seção vazia não aparece', () => {
    expect(groupByStatus([reward('1', 'locked')]).map((g) => g.status)).toEqual(['locked']);
    expect(groupByStatus([])).toEqual([]);
  });
});
