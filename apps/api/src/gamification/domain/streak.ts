import { addDays, type CivilDate, type Occurrence, type Streak } from '@lifexp/shared';

/** O que importa de um dia civil para o streak. */
export interface StreakDay {
  date: CivilDate;
  /** Blocos planejados no dia (os pulados não contam: pular é decisão da pessoa, RN11). */
  planned: number;
  /** Blocos do dia com conclusão ativa. */
  completed: number;
}

/**
 * Agrupa as ocorrências por dia EFETIVO (uma ocorrência movida conta no dia para onde foi) e
 * conta quantas estão planejadas e quantas concluídas. `completedKeys` usa `blockId|occurrenceDate`
 * (a identidade da ocorrência, RN32).
 */
export function buildStreakDays(
  occurrences: readonly Occurrence[],
  completedKeys: ReadonlySet<string>,
): StreakDay[] {
  const byDate = new Map<CivilDate, StreakDay>();
  for (const occurrence of occurrences) {
    if (occurrence.skipped) continue;
    const day = byDate.get(occurrence.date) ?? { date: occurrence.date, planned: 0, completed: 0 };
    day.planned += 1;
    if (completedKeys.has(`${occurrence.blockId}|${occurrence.occurrenceDate}`)) day.completed += 1;
    byDate.set(occurrence.date, day);
  }
  return [...byDate.values()];
}

/**
 * Streak (RN12 a RN15, RN33): só dias com bloco planejado contam; dia sem bloco é neutro (não
 * avança nem quebra). Em dia planejado, cumprir ao menos um bloco avança.
 *
 * Um dia planejado SEM nenhuma conclusão só quebra a sequência quando a janela de conclusão dele
 * fecha (23:59 do dia seguinte). Enquanto ainda dá tempo (hoje e ontem), ele é neutro: a pessoa
 * não perde nada por um dia que ainda está em aberto. Dias futuros não existem para o streak.
 */
export function computeStreak(days: readonly StreakDay[], today: CivilDate): Streak {
  const lastSettled = addDays(today, -2);
  const ordered = [...days]
    .filter((day) => day.planned > 0 && day.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  let current = 0;
  let best = 0;
  let lastFulfilledDate: CivilDate | null = null;

  for (const day of ordered) {
    if (day.completed > 0) {
      current += 1;
      best = Math.max(best, current);
      lastFulfilledDate = day.date;
    } else if (day.date <= lastSettled) {
      current = 0;
    }
  }

  return { current, best, lastFulfilledDate };
}
