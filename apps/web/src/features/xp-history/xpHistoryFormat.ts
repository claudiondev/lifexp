import {
  addDays,
  todayIn,
  type CivilDate,
  type XpEntryType,
  type XpHistoryEntry,
  type XpSourceType,
} from '@lifexp/shared';
import { longDate } from '@/lib/civilFormat';

export const XP_HISTORY_FILTERS: { value: XpEntryType | undefined; label: string }[] = [
  { value: undefined, label: 'Tudo' },
  { value: 'completion', label: 'Blocos' },
  { value: 'milestone', label: 'Marcos' },
  { value: 'goal', label: 'Metas' },
  { value: 'quest', label: 'Quests' },
  { value: 'reversal', label: 'Estornos' },
];

const SOURCE_NAME: Record<XpSourceType, string> = {
  completion: 'bloco',
  milestone: 'marco',
  goal: 'meta',
  quest: 'quest',
};

/** Quando a origem não existe mais, o lançamento continua valendo: só falta o nome. */
const MISSING_SOURCE: Record<XpSourceType, string> = {
  completion: 'Bloco concluído',
  milestone: 'Marco excluído',
  goal: 'Meta excluída',
  quest: 'Quest da semana',
};

/** O tipo de origem do lançamento; no estorno, o do lançamento estornado. */
const sourceOf = (entry: XpHistoryEntry): XpSourceType | null =>
  entry.type === 'reversal' ? entry.reversedType : entry.type;

/** Nome da atividade, do marco ou da meta (ou o aviso de que foi excluído). */
export function entryTitle(entry: XpHistoryEntry): string {
  if (entry.sourceLabel) return entry.sourceLabel;
  const source = sourceOf(entry);
  return source ? MISSING_SOURCE[source] : 'Origem desconhecida';
}

/** "Bloco", "Marco", "Meta" ou, no estorno, "Estorno de bloco". Tom neutro: estorno não é punição. */
export function entryKind(entry: XpHistoryEntry): string {
  const source = sourceOf(entry);
  if (entry.type === 'reversal') return source ? `Estorno de ${SOURCE_NAME[source]}` : 'Estorno';
  const name = SOURCE_NAME[entry.type];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** "+60 XP" ou "−60 XP" (sinal de menos tipográfico). */
export function formatAmount(amount: number): string {
  return `${amount < 0 ? '−' : '+'}${Math.abs(amount)} XP`;
}

/** "09:05" no fuso da pessoa. */
export function entryTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(iso));
}

export interface HistoryDay {
  date: CivilDate;
  entries: XpHistoryEntry[];
  /** Saldo do dia entre os lançamentos carregados (ganhos menos estornos). */
  total: number;
}

/**
 * Agrupa por dia LOCAL da pessoa (um lançamento às 23:30 de São Paulo já é "amanhã" em UTC).
 * Mantém a ordem recebida: do mais novo ao mais antigo.
 */
export function groupByDay(entries: readonly XpHistoryEntry[], timezone: string): HistoryDay[] {
  const days: HistoryDay[] = [];
  for (const entry of entries) {
    const date = todayIn(timezone, new Date(entry.createdAt));
    const last = days[days.length - 1];
    if (last && last.date === date) {
      last.entries.push(entry);
      last.total += entry.amount;
    } else {
      days.push({ date, entries: [entry], total: entry.amount });
    }
  }
  return days;
}

/** "Hoje", "Ontem" ou "5 de outubro de 2026". */
export function dayHeading(date: CivilDate, today: CivilDate): string {
  if (date === today) return 'Hoje';
  if (date === addDays(today, -1)) return 'Ontem';
  return longDate(date);
}
