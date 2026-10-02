import {
  addDays,
  type AreaColor,
  type AreaIcon,
  type CivilDate,
  type Occurrence,
  type WeeklyReport,
} from '@lifexp/shared';
import { settledThrough } from '../../gamification/domain/streak.js';

type Blocks = WeeklyReport['blocks'];
type Area = WeeklyReport['areas'][number];

export interface ReportArea {
  id: string;
  name: string;
  color: AreaColor;
  icon: AreaIcon;
  archived: boolean;
}

export interface ReportLedgerRow {
  /** Positivo = ganho; negativo = estorno. */
  amount: number;
  areaId: string | null;
}

export const adherence = (planned: number, completed: number): number | null =>
  planned === 0 ? null : Math.round((completed * 100) / planned);

interface Tally {
  planned: number;
  completed: number;
  skipped: number;
  open: number;
  minutes: number;
}
const EMPTY = (): Tally => ({ planned: 0, completed: 0, skipped: 0, open: 0, minutes: 0 });

/**
 * Conta os blocos da semana (de `weekStart` até o domingo), com as mesmas regras do radar e do streak:
 * - pulado só aparece como "pulado" (não pune, RN11);
 * - concluído sempre entra, como planejado e como concluído;
 * - o que não foi concluído só entra como "planejado" depois que a janela de conclusão fecha; enquanto ainda dá
 *   tempo (hoje e ontem) vai para "em aberto" e não pesa na aderência;
 * - o que ainda vai acontecer (depois de hoje) não entra em nada.
 * `completedKeys` usa `blockId|occurrenceDate` (RN32). Devolve o total, o de cada área e o melhor dia.
 */
export function tallyWeek(
  occurrences: readonly Occurrence[],
  completedKeys: ReadonlySet<string>,
  weekStart: CivilDate,
  today: CivilDate,
): {
  total: Tally;
  byArea: Map<string, Tally>;
  bestDay: { date: CivilDate; completed: number } | null;
} {
  const weekEnd = addDays(weekStart, 6);
  const settled = settledThrough(today);
  const total = EMPTY();
  const byArea = new Map<string, Tally>();
  const doneByDay = new Map<CivilDate, number>();

  for (const occurrence of occurrences) {
    if (occurrence.date < weekStart || occurrence.date > weekEnd) continue;
    const area = byArea.get(occurrence.areaId) ?? EMPTY();
    byArea.set(occurrence.areaId, area);

    if (occurrence.skipped) {
      total.skipped += 1;
      area.skipped += 1;
      continue;
    }
    const done = completedKeys.has(`${occurrence.blockId}|${occurrence.occurrenceDate}`);
    if (done) {
      for (const tally of [total, area]) {
        tally.planned += 1;
        tally.completed += 1;
        tally.minutes += occurrence.durationMin;
      }
      doneByDay.set(occurrence.date, (doneByDay.get(occurrence.date) ?? 0) + 1);
    } else if (occurrence.date <= settled) {
      total.planned += 1;
      area.planned += 1;
    } else if (occurrence.date <= today) {
      total.open += 1;
      area.open += 1;
    }
  }

  let bestDay: { date: CivilDate; completed: number } | null = null;
  for (const [date, completed] of doneByDay) {
    if (
      !bestDay ||
      completed > bestDay.completed ||
      (completed === bestDay.completed && date < bestDay.date)
    ) {
      bestDay = { date, completed };
    }
  }
  return { total, byArea, bestDay };
}

export function toReportBlocks(tally: Tally): Blocks {
  return {
    planned: tally.planned,
    completed: tally.completed,
    skipped: tally.skipped,
    open: tally.open,
    adherence: adherence(tally.planned, tally.completed),
  };
}

/**
 * As áreas ativas sempre aparecem (mesmo vazias: "sem dados" não é abandono, RN42); as arquivadas só se tiveram
 * algo na semana. Na ordem recebida.
 */
export function toReportAreas(
  areas: readonly ReportArea[],
  byArea: ReadonlyMap<string, Tally>,
): Area[] {
  const result: Area[] = [];
  for (const area of areas) {
    const tally = byArea.get(area.id) ?? EMPTY();
    const hasData = tally.planned > 0 || tally.completed > 0 || tally.skipped > 0 || tally.open > 0;
    if (area.archived && !hasData) continue;
    result.push({
      areaId: area.id,
      name: area.name,
      color: area.color,
      icon: area.icon,
      planned: tally.planned,
      completed: tally.completed,
      score: adherence(tally.planned, tally.completed),
      minutes: tally.minutes,
    });
  }
  return result;
}

const NO_AREA = 'Sem área';

/** XP da semana: ganhos, estornos (positivo) e o líquido, total e por área (a que ficou em zero não aparece). */
export function summarizeXp(
  rows: readonly ReportLedgerRow[],
  areas: readonly Pick<ReportArea, 'id' | 'name'>[],
): WeeklyReport['xp'] {
  const names = new Map(areas.map((area) => [area.id, area.name]));
  let gained = 0;
  let reverted = 0;
  const net = new Map<string | null, number>();
  for (const row of rows) {
    if (row.amount > 0) gained += row.amount;
    else reverted += -row.amount;
    net.set(row.areaId, (net.get(row.areaId) ?? 0) + row.amount);
  }
  const byArea = [...net.entries()]
    .filter(([, amount]) => amount !== 0)
    .map(([areaId, amount]) => ({
      areaId,
      name: areaId === null ? NO_AREA : (names.get(areaId) ?? 'Área excluída'),
      amount,
    }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'pt-BR'));
  return { gained, reverted, net: gained - reverted, byArea };
}
