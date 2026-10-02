import type { Goal } from '@lifexp/shared';
import { describe, expect, it } from 'vitest';
import {
  allowsMilestoneToggle,
  formatInvested,
  formatNumber,
  progressPercent,
  progressText,
  statusActions,
} from './goalFormat';

const goal = (overrides: Partial<Goal> = {}): Goal => ({
  id: '0192f1a0-7b3c-7000-8000-0000000000c1',
  areaId: null,
  title: 'Meta',
  description: null,
  deadline: null,
  status: 'active',
  unit: null,
  targetValue: null,
  currentValue: null,
  completedAt: null,
  overdue: false,
  progress: { ratio: null, source: null },
  readyToComplete: false,
  milestones: [],
  investedMinutes: 0,
  ...overrides,
});

const milestone = (done: boolean) => ({
  id: crypto.randomUUID(),
  title: 'm',
  done,
  doneAt: done ? '2026-10-07T15:00:00.000Z' : null,
  position: 0,
});

describe('progressPercent', () => {
  it('arredonda para inteiro e é nulo sem como medir', () => {
    expect(progressPercent(goal({ progress: { ratio: 0.256, source: 'metric' } }))).toBe(26);
    expect(progressPercent(goal({ progress: { ratio: 1, source: 'metric' } }))).toBe(100);
    expect(progressPercent(goal({ progress: { ratio: 0, source: 'milestones' } }))).toBe(0);
    expect(progressPercent(goal())).toBeNull();
  });
});

describe('progressText', () => {
  it('métrica: "12 de 100 km"', () => {
    const g = goal({
      targetValue: 100,
      currentValue: 12.5,
      unit: 'km',
      progress: { ratio: 0.125, source: 'metric' },
    });
    expect(progressText(g)).toBe('12,5 de 100 km');
  });

  it('métrica sem unidade não deixa espaço sobrando', () => {
    const g = goal({
      targetValue: 10,
      currentValue: 3,
      progress: { ratio: 0.3, source: 'metric' },
    });
    expect(progressText(g)).toBe('3 de 10');
  });

  it('marcos: conta os feitos, no singular e no plural', () => {
    expect(
      progressText(
        goal({
          milestones: [milestone(true), milestone(false)],
          progress: { ratio: 0.5, source: 'milestones' },
        }),
      ),
    ).toBe('1 de 2 marcos');
    expect(
      progressText(
        goal({ milestones: [milestone(false)], progress: { ratio: 0, source: 'milestones' } }),
      ),
    ).toBe('0 de 1 marco');
  });

  it('sem como medir, orienta o que fazer', () => {
    expect(progressText(goal())).toMatch(/marcos ou uma métrica/);
  });
});

describe('formatos', () => {
  it('tempo investido', () => {
    expect(formatInvested(0)).toBe('0 min');
    expect(formatInvested(45)).toBe('45 min');
    expect(formatInvested(150)).toBe('2 h 30 min');
  });

  it('números em pt-BR', () => {
    expect(formatNumber(1234.5)).toBe('1.234,5');
  });
});

describe('statusActions', () => {
  const targets = (status: Parameters<typeof statusActions>[0]) =>
    statusActions(status).map((action) => action.to);

  it('meta ativa: concluir (destaque), pausar e abandonar', () => {
    expect(targets('active')).toEqual(['completed', 'paused', 'abandoned']);
    expect(statusActions('active')[0]).toMatchObject({ primary: true, hint: '+500 XP' });
  });

  it('meta pausada: retomar, concluir e abandonar', () => {
    expect(targets('paused')).toEqual(['active', 'completed', 'abandoned']);
  });

  it('concluída só reabre, avisando que o XP volta; abandonada só reativa', () => {
    expect(targets('completed')).toEqual(['active']);
    expect(statusActions('completed')[0]!.hint).toMatch(/500 XP/);
    expect(targets('abandoned')).toEqual(['active']);
  });

  it('nenhuma ação leva ao próprio status', () => {
    for (const status of ['active', 'paused', 'completed', 'abandoned'] as const) {
      expect(targets(status)).not.toContain(status);
    }
  });

  it('só uma ação é o destaque em cada estado', () => {
    for (const status of ['active', 'paused'] as const) {
      expect(statusActions(status).filter((action) => action.primary)).toHaveLength(1);
    }
    expect(statusActions('completed').some((action) => action.primary)).toBe(false);
  });
});

describe('allowsMilestoneToggle', () => {
  it('vale em metas ativas e pausadas, não em concluídas ou abandonadas', () => {
    expect(allowsMilestoneToggle('active')).toBe(true);
    expect(allowsMilestoneToggle('paused')).toBe(true);
    expect(allowsMilestoneToggle('completed')).toBe(false);
    expect(allowsMilestoneToggle('abandoned')).toBe(false);
  });
});
