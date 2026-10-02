import {
  MAX_SERIES_WEEKS,
  firstOccurrenceOnOrAfter,
  isValidCivilDate,
  validUntilForWeeks,
  type CivilDate,
} from '@lifexp/shared';
import { WEEKDAY_OPTIONS } from './blockOptions';

export type EndMode = 'never' | 'until' | 'weeks';

/** Pré-seleções rápidas de dias (segunda = 1 ... domingo = 7). */
export const WEEKDAY_PRESETS = {
  workdays: [1, 2, 3, 4, 5],
  everyday: [1, 2, 3, 4, 5, 6, 7],
} as const;

/** Duração padrão sugerida para "Por N semanas" e para "Até uma data". */
export const DEFAULT_SERIES_WEEKS = 8;

const sortedUnique = (days: readonly number[]) => [...new Set(days)].sort((a, b) => a - b);
const fullName = (weekday: number) => WEEKDAY_OPTIONS[weekday - 1]!.label.toLowerCase();
/** "segunda", "terça"... (sem o "-feira"): cabe em listas. */
const shortName = (weekday: number) => fullName(weekday).replace('-feira', '');

/** Liga ou desliga um dia da semana, devolvendo a lista em ordem de segunda a domingo. */
export function toggleWeekday(days: readonly number[], weekday: number): number[] {
  return days.includes(weekday)
    ? days.filter((day) => day !== weekday)
    : sortedUnique([...days, weekday]);
}

function isContiguous(days: readonly number[]): boolean {
  return days.every((day, index) => index === 0 || day === days[index - 1]! + 1);
}

/**
 * Os dias da semana por extenso, para o resumo do formulário:
 * "Toda quarta-feira", "Todo sábado", "De segunda a sexta", "Todos os dias" ou
 * "Toda semana: segunda, quarta e sexta". Sem dias, devolve nulo.
 */
export function describeWeekdays(weekdays: readonly number[]): string | null {
  const days = sortedUnique(weekdays);
  if (days.length === 0) return null;
  if (days.length === 7) return 'Todos os dias';
  if (days.length === 1) {
    const day = days[0]!;
    return `${day >= 6 ? 'Todo' : 'Toda'} ${fullName(day)}`;
  }
  if (days.length >= 3 && isContiguous(days)) {
    return `De ${shortName(days[0]!)} a ${shortName(days[days.length - 1]!)}`;
  }
  const names = days.map(shortName);
  return `Toda semana: ${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

/** A primeira ocorrência da série: a mais cedo entre os dias marcados, em ou depois de `validFrom`. */
export function firstOccurrence(validFrom: string, weekdays: readonly number[]): CivilDate | null {
  if (!isValidCivilDate(validFrom) || weekdays.length === 0) return null;
  return weekdays
    .map((weekday) => firstOccurrenceOnOrAfter(validFrom, weekday))
    .reduce((earliest, date) => (date < earliest ? date : earliest));
}

export interface EndInput {
  mode: EndMode;
  /** Data digitada em "Até uma data". */
  until: string;
  /** Número digitado em "Por N semanas" (NaN quando o campo está vazio). */
  weeks: number;
}

export type EndResolution =
  /** Sem fim: não se envia `validUntil`. */
  | { ok: true; validUntil: CivilDate | undefined }
  | { ok: false; field: 'endDate' | 'endWeeks'; message: string };

export const WEEKS_MESSAGE = `Informe de 1 a ${MAX_SERIES_WEEKS} semanas`;
export const UNTIL_MESSAGE = 'Informe a data final';

/** Traduz a escolha de término no `validUntil` que a API espera. */
export function resolveEnd(end: EndInput, validFrom: string): EndResolution {
  if (end.mode === 'never') return { ok: true, validUntil: undefined };
  if (end.mode === 'until') {
    return isValidCivilDate(end.until)
      ? { ok: true, validUntil: end.until }
      : { ok: false, field: 'endDate', message: UNTIL_MESSAGE };
  }
  const valid = Number.isInteger(end.weeks) && end.weeks >= 1 && end.weeks <= MAX_SERIES_WEEKS;
  if (!valid) return { ok: false, field: 'endWeeks', message: WEEKS_MESSAGE };
  // Sem data de início válida, o erro aparece no campo dela; aqui só não há o que calcular.
  if (!isValidCivilDate(validFrom)) return { ok: true, validUntil: undefined };
  return { ok: true, validUntil: validUntilForWeeks(validFrom, end.weeks) };
}

/** "1 bloco criado" / "3 blocos criados". */
export function createdTitle(count: number): string {
  return count === 1 ? 'Bloco criado' : `${count} blocos criados`;
}
