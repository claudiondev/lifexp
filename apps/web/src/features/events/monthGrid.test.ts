import { weekdayOf } from '@lifexp/shared';
import { describe, expect, it } from 'vitest';
import { addMonths, lastDayOfMonth, monthGrid, monthStartOf, parseMonthParam } from './monthGrid';

describe('monthStartOf', () => {
  it('troca o dia por 01', () => {
    expect(monthStartOf('2026-10-17')).toBe('2026-10-01');
    expect(monthStartOf('2026-12-31')).toBe('2026-12-01');
  });
});

describe('parseMonthParam', () => {
  it('aceita AAAA-MM válido', () => {
    expect(parseMonthParam('2026-10')).toBe('2026-10-01');
  });

  it('lixo, mês inválido e vazio viram nulo', () => {
    for (const bad of [null, '', 'abc', '2026-13', '2026-00', '2026-1', '2026-10-05', '26-10']) {
      expect(parseMonthParam(bad)).toBeNull();
    }
  });
});

describe('addMonths', () => {
  it('soma e subtrai meses', () => {
    expect(addMonths('2026-10-01', 1)).toBe('2026-11-01');
    expect(addMonths('2026-10-01', -1)).toBe('2026-09-01');
    expect(addMonths('2026-10-01', 0)).toBe('2026-10-01');
  });

  it('atravessa a virada de ano nos dois sentidos', () => {
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01');
    expect(addMonths('2026-10-01', 15)).toBe('2028-01-01');
    expect(addMonths('2026-10-01', -10)).toBe('2025-12-01');
  });
});

describe('lastDayOfMonth', () => {
  it('trata meses de 28, 29, 30 e 31 dias', () => {
    expect(lastDayOfMonth('2026-02-01')).toBe('2026-02-28');
    expect(lastDayOfMonth('2028-02-01')).toBe('2028-02-29');
    expect(lastDayOfMonth('2026-04-01')).toBe('2026-04-30');
    expect(lastDayOfMonth('2026-12-01')).toBe('2026-12-31');
  });
});

describe('monthGrid', () => {
  it('outubro de 2026 (começa na quinta): 5 semanas de segunda a domingo', () => {
    const grid = monthGrid('2026-10-01');

    expect(grid).toHaveLength(5);
    expect(grid[0]![0]).toBe('2026-09-28');
    expect(grid[0]![3]).toBe('2026-10-01');
    expect(grid.at(-1)![6]).toBe('2026-11-01');
  });

  it('toda linha tem 7 dias consecutivos começando na segunda', () => {
    for (const month of ['2026-02-01', '2026-10-01', '2026-11-01', '2027-02-01']) {
      for (const week of monthGrid(month)) {
        expect(week).toHaveLength(7);
        expect(weekdayOf(week[0]!)).toBe(1);
      }
    }
  });

  it('cobre o mês inteiro, do dia 1 ao último, sem buracos', () => {
    const days = monthGrid('2026-10-01').flat();
    for (let day = 1; day <= 31; day += 1) {
      expect(days).toContain(`2026-10-${String(day).padStart(2, '0')}`);
    }
    expect(new Set(days).size).toBe(days.length);
  });

  it('fevereiro de 2027 (começa na segunda, 28 dias) cabe em exatamente 4 semanas', () => {
    const grid = monthGrid('2027-02-01');
    expect(grid).toHaveLength(4);
    expect(grid[0]![0]).toBe('2027-02-01');
    expect(grid[3]![6]).toBe('2027-02-28');
  });

  it('um mês pode precisar de 6 semanas (agosto de 2026 começa no sábado e tem 31 dias)', () => {
    expect(monthGrid('2026-08-01')).toHaveLength(6);
  });
});
