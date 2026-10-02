import { addDays, weekStartOf, type CivilDate, type Occurrence, type Streak } from '@lifexp/shared';

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
 * O último dia cuja janela de conclusão já fechou (23:59 do dia seguinte): em `today`, é anteontem.
 * Um dia planejado sem conclusão só "conta como perdido" até aqui; depois disso ainda dá tempo.
 */
export const settledThrough = (today: CivilDate): CivilDate => addDays(today, -2);

/**
 * Streak (RN12 a RN15, RN33): só dias com bloco planejado contam; dia sem bloco é neutro (não
 * avança nem quebra). Em dia planejado, cumprir ao menos um bloco avança.
 *
 * Um dia planejado SEM nenhuma conclusão só quebra a sequência quando a janela de conclusão dele
 * fecha (23:59 do dia seguinte). Enquanto ainda dá tempo (hoje e ontem), ele é neutro: a pessoa
 * não perde nada por um dia que ainda está em aberto. Dias futuros não existem para o streak.
 *
 * Coringa (RN14): em cada semana (segunda a domingo), o PRIMEIRO dia planejado perdido é perdoado, e
 * fica neutro: não quebra nem avança a sequência. Só gasta quando há sequência a proteger (current > 0),
 * então um dia perdido com o streak zerado não queima o coringa. Não acumula: semana sem uso não
 * dá dois na seguinte. O estado devolvido é o da semana de `today`.
 */
export function computeStreak(days: readonly StreakDay[], today: CivilDate): Streak {
  const lastSettled = settledThrough(today);
  const ordered = [...days]
    .filter((day) => day.planned > 0 && day.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  let current = 0;
  let best = 0;
  let lastFulfilledDate: CivilDate | null = null;
  const jokerUsedOn = new Map<CivilDate, CivilDate>();

  for (const day of ordered) {
    if (day.completed > 0) {
      current += 1;
      best = Math.max(best, current);
      lastFulfilledDate = day.date;
    } else if (day.date <= lastSettled) {
      const week = weekStartOf(day.date);
      if (current > 0 && !jokerUsedOn.has(week)) jokerUsedOn.set(week, day.date);
      else current = 0;
    }
  }

  const weekStart = weekStartOf(today);
  const usedOn = jokerUsedOn.get(weekStart) ?? null;
  return { current, best, lastFulfilledDate, joker: { weekStart, used: usedOn !== null, usedOn } };
}
