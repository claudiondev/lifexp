import { addDays, type AreaColor, type CivilDate, type XpEvolutionWeek } from '@lifexp/shared';

/** Uma semana como intervalo de instantes [from, to): da meia-noite local de segunda à da segunda seguinte. */
export interface WeekRange {
  weekStart: CivilDate;
  from: Date;
  to: Date;
}

/** Um lançamento do livro-caixa (só o que a evolução usa). */
export interface EvolutionRow {
  areaId: string | null;
  /** Positivo no ganho, negativo no estorno. */
  amount: number;
  createdAt: Date;
}

export interface EvolutionArea {
  id: string;
  name: string;
  color: AreaColor;
}

const NO_AREA = 'Sem área';
const DELETED_AREA = 'Área excluída';

/** As segundas-feiras das `weeks` últimas semanas, da mais antiga para a atual (`currentWeekStart`, a última). */
export function evolutionWeekStarts(currentWeekStart: CivilDate, weeks: number): CivilDate[] {
  return Array.from({ length: weeks }, (_, index) =>
    addDays(currentWeekStart, (index - (weeks - 1)) * 7),
  );
}

/**
 * XP líquido por semana e por área, a partir do livro-caixa (imutável): `gained` soma os ganhos, `reverted` os
 * estornos (em positivo) e `net` é a diferença. Cada lançamento cai na semana do SEU instante (não na da origem),
 * então estornar hoje um XP ganho semana passada reduz a semana de hoje. Semana sem lançamento aparece zerada, para
 * o gráfico não ter buracos. Lançamento fora de todas as semanas é ignorado.
 */
export function buildEvolution(
  rows: readonly EvolutionRow[],
  ranges: readonly WeekRange[],
  areas: readonly EvolutionArea[],
): XpEvolutionWeek[] {
  const known = new Map(areas.map((area) => [area.id, area]));

  return ranges.map(({ weekStart, from, to }) => {
    let gained = 0;
    let reverted = 0;
    const net = new Map<string | null, number>();

    for (const row of rows) {
      if (row.createdAt < from || row.createdAt >= to) continue;
      if (row.amount > 0) gained += row.amount;
      else reverted += -row.amount;
      net.set(row.areaId, (net.get(row.areaId) ?? 0) + row.amount);
    }

    const byArea = [...net.entries()]
      .filter(([, amount]) => amount !== 0)
      .map(([areaId, amount]) => {
        const area = areaId === null ? undefined : known.get(areaId);
        return {
          areaId,
          name: areaId === null ? NO_AREA : (area?.name ?? DELETED_AREA),
          color: area?.color ?? null,
          amount,
        };
      })
      .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'pt-BR'));

    return { weekStart, gained, reverted, net: gained - reverted, byArea };
  });
}
