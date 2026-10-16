import type { AreaColor, CivilDate, XpEvolutionWeek } from '@lifexp/shared';

const dayMonth = (date: CivilDate) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/** Períodos que a tela oferece (em semanas). */
export const PERIOD_OPTIONS = [4, 8, 12] as const;
export const DEFAULT_PERIOD = 8;

export interface BarSegment {
  areaId: string | null;
  name: string;
  color: AreaColor | null;
  amount: number;
  /** Fatia da altura da coluna (0 a 1). */
  share: number;
}

export interface Bar {
  weekStart: CivilDate;
  /** "05/10": a segunda-feira que abre a semana. */
  label: string;
  net: number;
  isCurrent: boolean;
  /** Só o que ficou positivo na semana (área com líquido negativo não desenha fatia). */
  segments: BarSegment[];
  /** Altura da coluna (0 a 1) em relação à maior semana da janela. */
  height: number;
}

/**
 * Colunas do gráfico: uma por semana, empilhadas por área. A altura de todas é relativa à MAIOR semana da janela (se
 * nenhuma tem XP positivo, ficam todas em zero, sem dividir por zero). O que decide a altura é a soma das fatias
 * positivas; o número mostrado na tela é o líquido (`net`), que também pode ser negativo.
 */
export function buildBars(weeks: readonly XpEvolutionWeek[]): Bar[] {
  const positiveTotals = weeks.map((week) =>
    week.byArea.reduce((sum, area) => sum + Math.max(area.amount, 0), 0),
  );
  const max = Math.max(0, ...positiveTotals);

  return weeks.map((week, index) => {
    const total = positiveTotals[index]!;
    return {
      weekStart: week.weekStart,
      label: dayMonth(week.weekStart),
      net: week.net,
      isCurrent: index === weeks.length - 1,
      segments: week.byArea
        .filter((area) => area.amount > 0)
        .map((area) => ({ ...area, share: total === 0 ? 0 : area.amount / total })),
      height: max === 0 ? 0 : total / max,
    };
  });
}

export type Trend = 'up' | 'same' | 'down' | 'none';

export interface Comparison {
  current: number;
  previous: number;
  /** `current - previous`. */
  delta: number;
  trend: Trend;
}

/**
 * Semana atual contra a anterior (as duas últimas da lista). `none` quando a anterior não rendeu nada: não há com o
 * que comparar, e "infinitas vezes mais" não diz coisa alguma.
 */
export function compareWeeks(weeks: readonly XpEvolutionWeek[]): Comparison {
  const current = weeks.at(-1)?.net ?? 0;
  const previous = weeks.at(-2)?.net ?? 0;
  const delta = current - previous;
  const trend: Trend = previous <= 0 ? 'none' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'same';
  return { current, previous, delta, trend };
}

/**
 * Texto do comparativo. O tom nunca cobra: a semana atual ainda está em andamento, então ficar abaixo da anterior
 * não é "queda", é "ainda dá tempo" (princípio do produto: recompensar sem punir).
 */
export function comparisonMessage({ current, previous, delta, trend }: Comparison): string {
  switch (trend) {
    case 'up':
      return `+${delta} XP a mais que a semana passada. Bom ritmo!`;
    case 'same':
      return 'Mesmo XP da semana passada, e ainda tem dias pela frente.';
    case 'down':
      return `A semana passada rendeu ${previous} XP; esta está em ${current}, e ainda tem dias pela frente.`;
    case 'none':
      return current > 0
        ? `${current} XP nesta semana até agora.`
        : 'Nenhum XP nesta semana ainda. Conclua um bloco para começar.';
  }
}

/** A semana de maior XP líquido da janela (só se rendeu algo). Em empate fica a mais recente. */
export function bestWeek(weeks: readonly XpEvolutionWeek[]): XpEvolutionWeek | null {
  let best: XpEvolutionWeek | null = null;
  for (const week of weeks) {
    if (week.net > 0 && (best === null || week.net >= best.net)) best = week;
  }
  return best;
}

/**
 * Frase da melhor semana da janela. Só aparece quando há com o que comparar (ao menos duas semanas com XP): para
 * quem está começando, "a melhor semana é a única" não diz nada. Se a melhor é a atual, comemora.
 */
export function bestWeekNote(weeks: readonly XpEvolutionWeek[]): string | null {
  if (weeks.filter((week) => week.net > 0).length < 2) return null;
  const best = bestWeek(weeks);
  if (!best) return null;
  if (best.weekStart === weeks.at(-1)?.weekStart) return 'Esta é a sua melhor semana do período!';
  return `Melhor semana: ${dayMonth(best.weekStart)} · ${formatXp(best.net)}`;
}

export const formatXp = (amount: number): string => `${amount.toLocaleString('pt-BR')} XP`;
