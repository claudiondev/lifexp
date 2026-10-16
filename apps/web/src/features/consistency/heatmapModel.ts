import { addDays, type CivilDate, type Consistency, type ConsistencyDay } from '@lifexp/shared';

/** Semanas mostradas (meio ano). */
export const HEATMAP_WEEKS = 26;

/**
 * Intensidade de um dia. Sem bloco planejado = `rest` (dia livre, sem julgamento); com plano e nada concluído = `none`
 * (um aro vazio, NUNCA vermelho: o mapa celebra o que foi feito, não cobra o que ficou); depois quatro níveis pela
 * fração concluída.
 */
export type Level = 'rest' | 'none' | 'low' | 'mid' | 'high' | 'full';

export function levelOf({
  planned,
  completed,
}: Pick<ConsistencyDay, 'planned' | 'completed'>): Level {
  if (planned === 0) return 'rest';
  if (completed === 0) return 'none';
  const ratio = completed / planned;
  if (ratio >= 1) return 'full';
  if (ratio >= 0.75) return 'high';
  if (ratio >= 0.5) return 'mid';
  return 'low';
}

export type Cell =
  | { kind: 'day'; date: CivilDate; planned: number; completed: number; level: Level }
  | { kind: 'future'; date: CivilDate };

export interface Column {
  weekStart: CivilDate;
  /** Segunda a domingo, sempre 7 células. */
  cells: Cell[];
  /** Mês ("out") quando esta é a primeira semana dele no mapa; senão nulo. */
  monthLabel: string | null;
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const monthOf = (date: CivilDate) => Number(date.slice(5, 7)) - 1;

/**
 * Grade do mapa: uma coluna por semana (segunda a domingo). `consistency.start` é sempre uma segunda-feira, então os
 * dias entram em ordem de 7 em 7; os que ainda não chegaram (o resto da semana atual) viram células "futuras", que
 * ocupam o lugar sem pintar nada.
 */
export function buildGrid({ start, days }: Pick<Consistency, 'start' | 'days'>): Column[] {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const last = days.at(-1)!.date;
  const columns: Column[] = [];
  let previousMonth = -1;

  for (let weekStart = start; weekStart <= last; weekStart = addDays(weekStart, 7)) {
    const cells: Cell[] = Array.from({ length: 7 }, (_, offset) => {
      const date = addDays(weekStart, offset);
      const day = byDate.get(date);
      return day
        ? { kind: 'day', date, planned: day.planned, completed: day.completed, level: levelOf(day) }
        : { kind: 'future', date };
    });
    const month = monthOf(weekStart);
    columns.push({ weekStart, cells, monthLabel: month === previousMonth ? null : MONTHS[month]! });
    previousMonth = month;
  }
  return columns;
}

export interface Summary {
  /** Dias com ao menos um bloco concluído. */
  activeDays: number;
  /** Dias que tinham algum bloco planejado (já fechado ou concluído). */
  plannedDays: number;
  completedBlocks: number;
}

export function summarize(days: readonly ConsistencyDay[]): Summary {
  let activeDays = 0;
  let plannedDays = 0;
  let completedBlocks = 0;
  for (const day of days) {
    if (day.planned > 0) plannedDays += 1;
    if (day.completed > 0) activeDays += 1;
    completedBlocks += day.completed;
  }
  return { activeDays, plannedDays, completedBlocks };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Texto da frase-resumo; o tom é de conquista (o que foi feito), nunca de falta. */
export function summaryText({ activeDays, plannedDays, completedBlocks }: Summary): string {
  if (plannedDays === 0) return 'Nenhum bloco planejado neste período ainda.';
  if (completedBlocks === 0)
    return 'Nenhum bloco concluído neste período ainda. O primeiro acende o mapa.';
  return `${plural(completedBlocks, 'bloco concluído', 'blocos concluídos')} em ${plural(activeDays, 'dia', 'dias')} (de ${plural(plannedDays, 'dia com plano', 'dias com plano')}).`;
}

const dayMonth = (date: CivilDate) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/** Dica de cada quadrado ("05/10: 3 de 4 blocos concluídos"). */
export function cellTitle(cell: Cell): string {
  if (cell.kind === 'future') return dayMonth(cell.date);
  if (cell.planned === 0) return `${dayMonth(cell.date)}: sem blocos planejados`;
  return `${dayMonth(cell.date)}: ${cell.completed} de ${plural(cell.planned, 'bloco concluído', 'blocos concluídos')}`;
}
