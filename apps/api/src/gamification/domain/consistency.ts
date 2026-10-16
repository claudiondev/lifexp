import {
  addDays,
  weekStartOf,
  type CivilDate,
  type ConsistencyDay,
  type Occurrence,
} from '@lifexp/shared';
import { settledThrough } from './streak.js';

export interface DayTally {
  planned: number;
  completed: number;
}

/** A segunda-feira da primeira semana mostrada: `weeks` semanas, a última sendo a de hoje. */
export const consistencyStart = (today: CivilDate, weeks: number): CivilDate =>
  addDays(weekStartOf(today), -(weeks - 1) * 7);

/**
 * Conta, por dia, os blocos planejados e os concluídos. Mesmas regras do radar e do streak (uma só ideia de
 * "planejado" em todo o produto):
 * - pular tira o bloco da conta (não pune, RN11);
 * - bloco concluído sempre entra (como planejado e como concluído);
 * - bloco não concluído só entra como "planejado" depois que a janela de conclusão dele fecha, para o que
 *   ainda dá tempo de cumprir (hoje e ontem) não aparecer como dia "vazio".
 * O dia é o EFETIVO da ocorrência (já com um eventual override de data). `completedKeys` usa
 * `blockId|occurrenceDate` (RN32).
 */
export function tallyByDay(
  occurrences: readonly Occurrence[],
  completedKeys: ReadonlySet<string>,
  today: CivilDate,
  start: CivilDate,
): Map<CivilDate, DayTally> {
  const settled = settledThrough(today);
  const tally = new Map<CivilDate, DayTally>();
  for (const occurrence of occurrences) {
    if (occurrence.skipped || occurrence.date < start || occurrence.date > today) continue;
    const done = completedKeys.has(`${occurrence.blockId}|${occurrence.occurrenceDate}`);
    if (!done && occurrence.date > settled) continue;
    const entry = tally.get(occurrence.date) ?? { planned: 0, completed: 0 };
    entry.planned += 1;
    if (done) entry.completed += 1;
    tally.set(occurrence.date, entry);
  }
  return tally;
}

/** Um item por dia de `start` até `today`, em ordem; os dias sem nenhum bloco vêm zerados. */
export function buildConsistencyDays(
  start: CivilDate,
  today: CivilDate,
  tally: ReadonlyMap<CivilDate, DayTally>,
): ConsistencyDay[] {
  const days: ConsistencyDay[] = [];
  for (let date = start; date <= today; date = addDays(date, 1)) {
    const { planned, completed } = tally.get(date) ?? { planned: 0, completed: 0 };
    days.push({ date, planned, completed });
  }
  return days;
}
