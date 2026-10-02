import { addDays, isValidCivilDate, weekStartOf, type CivilDate } from '@lifexp/shared';

/** Primeiro dia do mês ("2026-10-01") de uma data civil. */
export const monthStartOf = (date: CivilDate): CivilDate => `${date.slice(0, 7)}-01`;

/** "AAAA-MM" da URL vira o primeiro dia do mês; lixo vira nulo. */
export function parseMonthParam(param: string | null): CivilDate | null {
  if (!param || !/^\d{4}-\d{2}$/.test(param)) return null;
  const first = `${param}-01`;
  return isValidCivilDate(first) ? first : null;
}

/** Soma (ou subtrai) meses a um primeiro-dia-do-mês, atravessando anos. */
export function addMonths(monthStart: CivilDate, months: number): CivilDate {
  const total = Number(monthStart.slice(0, 4)) * 12 + (Number(monthStart.slice(5, 7)) - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
}

export const lastDayOfMonth = (monthStart: CivilDate): CivilDate =>
  addDays(addMonths(monthStart, 1), -1);

/**
 * As semanas (segunda a domingo) que cobrem o mês: de 4 a 6 linhas de 7 dias, incluindo os dias
 * dos meses vizinhos que completam as pontas.
 */
export function monthGrid(monthStart: CivilDate): CivilDate[][] {
  const first = weekStartOf(monthStart);
  const last = weekStartOf(lastDayOfMonth(monthStart));
  const weeks: CivilDate[][] = [];
  for (let week = first; week <= last; week = addDays(week, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, index) => addDays(week, index)));
  }
  return weeks;
}
