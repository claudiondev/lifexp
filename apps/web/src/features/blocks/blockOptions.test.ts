import {
  BLOCK_DURATION_MAX,
  BLOCK_DURATION_MIN,
  BLOCK_DURATION_STEP,
  durationMinSchema,
} from '@lifexp/shared';
import { describe, expect, it } from 'vitest';
import { DURATION_OPTIONS, WEEKDAY_OPTIONS, formatDuration } from './blockOptions';

describe('formatDuration', () => {
  it('formata minutos, horas cheias e horas com minutos', () => {
    expect(formatDuration(15)).toBe('15 min');
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(90)).toBe('1 h 30 min');
    expect(formatDuration(125)).toBe('2 h 5 min');
    expect(formatDuration(720)).toBe('12 h');
  });
});

describe('opções do formulário de bloco', () => {
  it('toda duração oferecida é aceita pela API (mesmo schema compartilhado)', () => {
    for (const { value } of DURATION_OPTIONS) {
      expect(durationMinSchema.safeParse(value).success).toBe(true);
    }
  });

  it('cobre os extremos permitidos e está em ordem crescente', () => {
    const values = DURATION_OPTIONS.map((option) => option.value);
    expect(values[0]).toBe(BLOCK_DURATION_MIN);
    expect(values.at(-1)).toBe(BLOCK_DURATION_MAX);
    expect(values.every((value) => value % BLOCK_DURATION_STEP === 0)).toBe(true);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });

  it('lista os 7 dias da semana ISO, de segunda (1) a domingo (7)', () => {
    expect(WEEKDAY_OPTIONS.map((option) => option.value)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(WEEKDAY_OPTIONS[0]?.label).toBe('Segunda-feira');
    expect(WEEKDAY_OPTIONS[6]?.label).toBe('Domingo');
  });
});
