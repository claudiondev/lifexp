import { describe, expect, it } from 'vitest';
import type { Quest } from '@lifexp/shared';
import { adherenceText, durationText, questLine, signedXp } from './reportFormat';

const quest = (over: Partial<Quest> = {}): Quest => ({
  weekStart: '2026-10-05',
  status: 'active',
  eligible: 5,
  completed: 2,
  target: 4,
  ratio: 0.4,
  bonusXp: 120,
  tiers: [],
  completedAt: null,
  ...over,
});

describe('durationText', () => {
  it('minutos, horas redondas e horas com minutos', () => {
    expect(durationText(0)).toBe('0 min');
    expect(durationText(45)).toBe('45 min');
    expect(durationText(60)).toBe('1 h');
    expect(durationText(120)).toBe('2 h');
    expect(durationText(495)).toBe('8 h 15 min');
  });
});

describe('adherenceText', () => {
  it('porcentagem, ou traço quando não há blocos contados (sem dados, não zero)', () => {
    expect(adherenceText(80)).toBe('80%');
    expect(adherenceText(0)).toBe('0%');
    expect(adherenceText(null)).toBe('—');
  });
});

describe('signedXp', () => {
  it('mostra o sinal só no positivo', () => {
    expect(signedXp(640)).toBe('+640');
    expect(signedXp(0)).toBe('0');
    expect(signedXp(-20)).toBe('-20');
  });
});

describe('questLine', () => {
  it('sem quest, cumprida e em andamento', () => {
    expect(questLine(quest({ status: 'none' }))).toBe('Esta semana não teve quest.');
    expect(questLine(quest({ status: 'completed', completed: 4 }))).toBe(
      'Cumprida: 4 de 5 blocos, com bônus de 120 XP.',
    );
    expect(questLine(quest())).toBe('Em andamento: 2 de 5 blocos (a meta são 4).');
  });
});
