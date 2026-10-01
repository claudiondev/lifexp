import { describe, expect, it } from 'vitest';
import {
  goalProgress,
  isOverdue,
  isReadyToComplete,
  statusXpEffect,
  type GoalStatus,
} from './goal-rules.js';

const input = (overrides: Partial<Parameters<typeof goalProgress>[0]> = {}) => ({
  targetValue: null,
  currentValue: null,
  milestonesDone: 0,
  milestonesTotal: 0,
  ...overrides,
});

describe('goalProgress (RN19)', () => {
  it('com métrica: valor atual ÷ alvo', () => {
    expect(goalProgress(input({ targetValue: 200, currentValue: 50 }))).toEqual({
      ratio: 0.25,
      source: 'metric',
    });
  });

  it('com métrica e sem valor atual ainda: 0%', () => {
    expect(goalProgress(input({ targetValue: 10 }))).toEqual({ ratio: 0, source: 'metric' });
  });

  it('passar do alvo vale 100%, nunca mais', () => {
    expect(goalProgress(input({ targetValue: 10, currentValue: 25 })).ratio).toBe(1);
  });

  it('valor atual negativo é tratado como 0', () => {
    expect(goalProgress(input({ targetValue: 10, currentValue: -5 })).ratio).toBe(0);
  });

  it('sem métrica: marcos concluídos ÷ total', () => {
    expect(goalProgress(input({ milestonesDone: 1, milestonesTotal: 4 }))).toEqual({
      ratio: 0.25,
      source: 'milestones',
    });
  });

  it('a métrica tem precedência sobre os marcos', () => {
    const result = goalProgress(
      input({ targetValue: 100, currentValue: 10, milestonesDone: 3, milestonesTotal: 3 }),
    );
    expect(result).toEqual({ ratio: 0.1, source: 'metric' });
  });

  it('alvo 0 não é métrica (evita dividir por zero) e cai nos marcos', () => {
    const result = goalProgress(
      input({ targetValue: 0, currentValue: 5, milestonesDone: 1, milestonesTotal: 2 }),
    );
    expect(result).toEqual({ ratio: 0.5, source: 'milestones' });
  });

  it('sem métrica e sem marcos: progresso indefinido (RN20)', () => {
    expect(goalProgress(input())).toEqual({ ratio: null, source: null });
  });
});

describe('isOverdue (RN22)', () => {
  const base = { deadline: '2026-10-10', today: '2026-10-11' };

  it('prazo vencido e meta ativa ou pausada: atrasada', () => {
    expect(isOverdue({ ...base, status: 'ACTIVE' })).toBe(true);
    expect(isOverdue({ ...base, status: 'PAUSED' })).toBe(true);
  });

  it('no dia do prazo ainda não está atrasada', () => {
    expect(isOverdue({ status: 'ACTIVE', deadline: '2026-10-10', today: '2026-10-10' })).toBe(
      false,
    );
  });

  it('antes do prazo não está atrasada', () => {
    expect(isOverdue({ status: 'ACTIVE', deadline: '2026-10-12', today: '2026-10-11' })).toBe(
      false,
    );
  });

  it('concluída ou abandonada nunca é atrasada', () => {
    expect(isOverdue({ ...base, status: 'COMPLETED' })).toBe(false);
    expect(isOverdue({ ...base, status: 'ABANDONED' })).toBe(false);
  });

  it('sem prazo nunca atrasa', () => {
    expect(isOverdue({ status: 'ACTIVE', deadline: null, today: '2030-01-01' })).toBe(false);
  });
});

describe('statusXpEffect (RN21)', () => {
  const all: GoalStatus[] = ['ACTIVE', 'PAUSED', 'ABANDONED', 'COMPLETED'];

  it('concluir concede o XP, de qualquer outro status', () => {
    for (const from of ['ACTIVE', 'PAUSED', 'ABANDONED'] as const) {
      expect(statusXpEffect(from, 'COMPLETED')).toBe('award');
    }
  });

  it('sair de concluída estorna o XP, para qualquer outro status', () => {
    for (const to of ['ACTIVE', 'PAUSED', 'ABANDONED'] as const) {
      expect(statusXpEffect('COMPLETED', to)).toBe('reverse');
    }
  });

  it('manter o mesmo status ou trocar entre os não concluídos não mexe no XP', () => {
    for (const status of all) expect(statusXpEffect(status, status)).toBe('none');
    expect(statusXpEffect('ACTIVE', 'PAUSED')).toBe('none');
    expect(statusXpEffect('PAUSED', 'ABANDONED')).toBe('none');
    expect(statusXpEffect('ABANDONED', 'ACTIVE')).toBe('none');
  });
});

describe('isReadyToComplete', () => {
  it('só está pronta com 100% medido', () => {
    expect(isReadyToComplete({ ratio: 1, source: 'metric' })).toBe(true);
    expect(isReadyToComplete({ ratio: 0.99, source: 'metric' })).toBe(false);
    expect(isReadyToComplete({ ratio: null, source: null })).toBe(false);
  });
});
