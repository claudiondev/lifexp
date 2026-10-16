import type { XpEvolutionWeek } from '@lifexp/shared';
import { describe, expect, it } from 'vitest';
import {
  bestWeek,
  bestWeekNote,
  buildBars,
  compareWeeks,
  comparisonMessage,
} from './xpEvolutionModel';

const week = (
  weekStart: string,
  areas: { amount: number; color?: 'violet' | 'gold' | null; name?: string }[],
  patch: Partial<XpEvolutionWeek> = {},
): XpEvolutionWeek => {
  const gained = areas.filter((a) => a.amount > 0).reduce((s, a) => s + a.amount, 0);
  const reverted = areas.filter((a) => a.amount < 0).reduce((s, a) => s - a.amount, 0);
  return {
    weekStart,
    gained,
    reverted,
    net: gained - reverted,
    byArea: areas.map((a, index) => ({
      areaId: `area-${index}`,
      name: a.name ?? `Área ${index}`,
      color: a.color === undefined ? 'violet' : a.color,
      amount: a.amount,
    })),
    ...patch,
  };
};
const net = (weekStart: string, amount: number) =>
  week(weekStart, amount === 0 ? [] : [{ amount }]);

describe('buildBars', () => {
  it('a altura é relativa à maior semana, e a última é a atual', () => {
    const bars = buildBars([net('2026-09-28', 50), net('2026-10-05', 100), net('2026-10-12', 25)]);
    expect(bars.map((bar) => bar.height)).toEqual([0.5, 1, 0.25]);
    expect(bars.map((bar) => bar.isCurrent)).toEqual([false, false, true]);
  });

  it('rótulo é dia/mês da segunda-feira', () => {
    expect(buildBars([net('2026-01-05', 10), net('2026-01-12', 10)])[0]!.label).toBe('05/01');
  });

  it('sem XP em nenhuma semana: tudo em zero, sem dividir por zero', () => {
    const bars = buildBars([net('2026-10-05', 0), net('2026-10-12', 0)]);
    expect(bars.map((bar) => bar.height)).toEqual([0, 0]);
    expect(bars.every((bar) => bar.segments.length === 0)).toBe(true);
  });

  it('as fatias de uma coluna somam 1', () => {
    const [bar] = buildBars([
      week('2026-10-05', [{ amount: 60 }, { amount: 30, color: 'gold' }, { amount: 10 }]),
      net('2026-10-12', 0),
    ]);
    expect(bar!.segments.map((segment) => segment.share)).toEqual([0.6, 0.3, 0.1]);
    expect(bar!.segments.reduce((sum, segment) => sum + segment.share, 0)).toBeCloseTo(1);
  });

  it('área com líquido negativo não desenha fatia, mas o líquido da semana continua verdadeiro', () => {
    const [bar] = buildBars([
      week('2026-10-05', [{ amount: 80 }, { amount: -30, color: 'gold' }]),
      net('2026-10-12', 0),
    ]);
    expect(bar!.segments).toHaveLength(1);
    expect(bar!.segments[0]!.share).toBe(1);
    expect(bar!.net).toBe(50);
  });

  it('semana só com estorno (líquido negativo) fica sem coluna', () => {
    const [bar] = buildBars([net('2026-10-05', -40), net('2026-10-12', 20)]);
    expect(bar).toMatchObject({ net: -40, height: 0, segments: [] });
  });
});

describe('compareWeeks / comparisonMessage', () => {
  const compare = (previous: number, current: number) =>
    compareWeeks([net('2026-10-05', previous), net('2026-10-12', current)]);

  it('subiu', () => {
    const result = compare(100, 150);
    expect(result).toEqual({ current: 150, previous: 100, delta: 50, trend: 'up' });
    expect(comparisonMessage(result)).toContain('+50 XP a mais');
  });

  it('igual', () => {
    expect(compare(100, 100).trend).toBe('same');
    expect(comparisonMessage(compare(100, 100))).toContain('Mesmo XP');
  });

  it('abaixo: o texto não cobra nem fala em queda ou meta perdida', () => {
    const result = compare(100, 40);
    expect(result.trend).toBe('down');
    const text = comparisonMessage(result);
    expect(text).toContain('ainda tem dias pela frente');
    expect(text).not.toMatch(/queda|perdeu|pior|menos|atras/i);
  });

  it('sem XP na semana anterior não há com o que comparar', () => {
    expect(compare(0, 80).trend).toBe('none');
    expect(comparisonMessage(compare(0, 80))).toBe('80 XP nesta semana até agora.');
    expect(comparisonMessage(compare(0, 0))).toContain('Nenhum XP nesta semana');
  });

  it('semana anterior com líquido negativo também não serve de base', () => {
    expect(compare(-20, 50).trend).toBe('none');
  });
});

describe('bestWeek', () => {
  it('é a de maior líquido', () => {
    const weeks = [net('2026-09-28', 50), net('2026-10-05', 120), net('2026-10-12', 80)];
    expect(bestWeek(weeks)?.weekStart).toBe('2026-10-05');
  });

  it('em empate fica a mais recente', () => {
    expect(bestWeek([net('2026-10-05', 90), net('2026-10-12', 90)])?.weekStart).toBe('2026-10-12');
  });

  it('sem nenhuma semana positiva não há melhor', () => {
    expect(bestWeek([net('2026-10-05', 0), net('2026-10-12', -10)])).toBeNull();
  });
});

describe('bestWeekNote', () => {
  it('aponta a melhor semana quando ela não é a atual', () => {
    const weeks = [net('2026-09-28', 160), net('2026-10-05', 80), net('2026-10-12', 150)];
    expect(bestWeekNote(weeks)).toBe('Melhor semana: 28/09 · 160 XP');
  });

  it('comemora quando a melhor é a atual', () => {
    const weeks = [net('2026-10-05', 80), net('2026-10-12', 150)];
    expect(bestWeekNote(weeks)).toBe('Esta é a sua melhor semana do período!');
  });

  it('com uma semana só rendendo XP não há com o que comparar', () => {
    expect(bestWeekNote([net('2026-10-05', 0), net('2026-10-12', 150)])).toBeNull();
    expect(bestWeekNote([net('2026-10-05', 0), net('2026-10-12', 0)])).toBeNull();
  });
});
