import { addDays, type CivilDate, type Occurrence } from '@lifexp/shared';
import { settledThrough } from './streak.js';

export const BALANCE_WINDOW_DAYS = 28;

export interface AreaTally {
  planned: number;
  completed: number;
}

/** As últimas 4 semanas corridas (28 dias) terminando hoje, no fuso da pessoa. */
export const balanceWindow = (today: CivilDate) => ({
  start: addDays(today, -(BALANCE_WINDOW_DAYS - 1)),
  end: today,
});

/** Nota de 0 a 100, ou nula quando nada foi planejado ("sem dados" não é zero). */
export const balanceScore = (planned: number, completed: number): number | null =>
  planned === 0 ? null : Math.round((completed * 100) / planned);

/**
 * Conta, por área, os blocos planejados e os concluídos na janela (RN41). Mesmas regras do streak:
 * - pular tira o bloco da conta (não pune, RN11);
 * - bloco concluído sempre entra (como planejado e como concluído);
 * - bloco não concluído só entra como "planejado" depois que a janela de conclusão dele fecha, para o
 *   que ainda dá tempo de cumprir (hoje e ontem) não puxar a nota para baixo.
 * Conta BLOCOS, não minutos (RN42). `completedKeys` usa `blockId|occurrenceDate` (RN32).
 */
export function tallyByArea(
  occurrences: readonly Occurrence[],
  completedKeys: ReadonlySet<string>,
  today: CivilDate,
): Map<string, AreaTally> {
  const { start, end } = balanceWindow(today);
  const settled = settledThrough(today);
  const tally = new Map<string, AreaTally>();
  for (const occurrence of occurrences) {
    if (occurrence.skipped || occurrence.date < start || occurrence.date > end) continue;
    const done = completedKeys.has(`${occurrence.blockId}|${occurrence.occurrenceDate}`);
    if (!done && occurrence.date > settled) continue;
    const entry = tally.get(occurrence.areaId) ?? { planned: 0, completed: 0 };
    entry.planned += 1;
    if (done) entry.completed += 1;
    tally.set(occurrence.areaId, entry);
  }
  return tally;
}
