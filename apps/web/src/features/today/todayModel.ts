import type { OccurrenceStatus, TodayItem } from '@lifexp/shared';

/** Chave estável de uma ocorrência (a identidade dela é bloco + data original). */
export const itemKey = (item: TodayItem) => `${item.blockId}:${item.occurrenceDate}`;

const byTime = (a: TodayItem, b: TodayItem) =>
  a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date);

/**
 * Separa o que é de hoje do que veio de ontem e ainda dá tempo de concluir (RN08). Cada grupo sai
 * em ordem cronológica.
 */
export function splitByDay(items: TodayItem[], today: string) {
  const sorted = [...items].sort(byTime);
  return {
    carryover: sorted.filter((item) => item.date < today),
    today: sorted.filter((item) => item.date >= today),
  };
}

/** O próximo bloco do dia: o primeiro que ainda não terminou de ser resolvido. */
export function findNext(todayItems: TodayItem[]): TodayItem | undefined {
  return todayItems.find((item) => item.status === 'open' || item.status === 'upcoming');
}

/** Quantos blocos do dia contam para "X de Y": os pulados ficam de fora (RN11). */
export function dayProgress(todayItems: TodayItem[]): { done: number; total: number } {
  const counted = todayItems.filter((item) => item.status !== 'skipped');
  return {
    done: counted.filter((item) => item.status === 'completed').length,
    total: counted.length,
  };
}

export const STATUS_LABEL: Record<OccurrenceStatus, string> = {
  upcoming: 'Ainda não começou',
  open: 'Pode concluir',
  completed: 'Concluído',
  closed: 'Prazo encerrado',
  skipped: 'Pulado',
};
