import { addDays, type CivilDate } from '@lifexp/shared';

/**
 * Datas civis (AAAA-MM-DD) não são instantes: formatar em UTC evita que o fuso do navegador
 * desloque o dia (ex.: 2026-10-07 virando dia 6 num fuso negativo).
 */
const parse = (date: CivilDate) => new Date(`${date}T00:00:00.000Z`);
const format = (date: CivilDate, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('pt-BR', { ...options, timeZone: 'UTC' }).format(parse(date));
const clean = (text: string) => text.replace('.', '');
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "Seg", "Ter"... */
export const weekdayShort = (date: CivilDate) =>
  capitalize(clean(format(date, { weekday: 'short' })));

/** "quarta-feira" */
export const weekdayLong = (date: CivilDate) => format(date, { weekday: 'long' });

export const dayOfMonth = (date: CivilDate) => Number(date.slice(8, 10));

/** "7 de outubro de 2026" */
export const longDate = (date: CivilDate) =>
  format(date, { day: 'numeric', month: 'long', year: 'numeric' });

/** "out" (mês abreviado, sem ponto). */
const monthShort = (date: CivilDate) => clean(format(date, { month: 'short' }));
const year = (date: CivilDate) => date.slice(0, 4);

/**
 * "5 – 11 out 2026", "28 set – 4 out 2026" ou "28 dez 2026 – 3 jan 2027" (virada de ano).
 * Montado pelas partes, em vez de depender do formato que o Intl escolhe para o idioma.
 */
export function formatWeekRange(weekStart: CivilDate): string {
  const weekEnd = addDays(weekStart, 6);
  const [d1, d2] = [dayOfMonth(weekStart), dayOfMonth(weekEnd)];
  const [m1, m2] = [monthShort(weekStart), monthShort(weekEnd)];

  if (year(weekStart) !== year(weekEnd)) {
    return `${d1} ${m1} ${year(weekStart)} – ${d2} ${m2} ${year(weekEnd)}`;
  }
  if (weekStart.slice(5, 7) === weekEnd.slice(5, 7)) {
    return `${d1} – ${d2} ${m2} ${year(weekEnd)}`;
  }
  return `${d1} ${m1} – ${d2} ${m2} ${year(weekEnd)}`;
}
