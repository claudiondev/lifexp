import { DateTime } from 'luxon';

/**
 * Datas civis ("2026-10-01") não são um instante: valem para quem olha o calendário, em qualquer
 * fuso (RN36). Por isso trafegam como texto YYYY-MM-DD e a aritmética acontece em UTC, onde não
 * existe horário de verão. Horário do dia ("09:30") também é hora de relógio, sem fuso (RN37).
 */
export type CivilDate = string;

const CIVIL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MINUTES_PER_DAY = 24 * 60;

export function isValidCivilDate(value: string): boolean {
  return CIVIL_DATE_PATTERN.test(value) && DateTime.fromISO(value, { zone: 'utc' }).isValid;
}

export function isValidTimeOfDay(value: string): boolean {
  return TIME_PATTERN.test(value);
}

function parse(date: CivilDate): DateTime {
  const parsed = DateTime.fromISO(date, { zone: 'utc' });
  if (!CIVIL_DATE_PATTERN.test(date) || !parsed.isValid) {
    throw new Error(`Data civil inválida: ${date}`);
  }
  return parsed;
}

function format(value: DateTime): CivilDate {
  return value.toISODate() as CivilDate;
}

export function addDays(date: CivilDate, days: number): CivilDate {
  return format(parse(date).plus({ days }));
}

/** Dia da semana ISO: 1 = segunda ... 7 = domingo. */
export function weekdayOf(date: CivilDate): number {
  return parse(date).weekday;
}

/** A semana começa na segunda-feira (ISO 8601). */
export function weekStartOf(date: CivilDate): CivilDate {
  return format(parse(date).startOf('week'));
}

export function isWeekStart(date: CivilDate): boolean {
  return weekdayOf(date) === 1;
}

/** Os 7 dias da semana que começa em `weekStart`. */
export function weekDates(weekStart: CivilDate): CivilDate[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

/** Datas civis comparam corretamente como texto, porque o formato é ordenável. */
export function compareCivil(a: CivilDate, b: CivilDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** "Hoje" para quem está no fuso informado (a data civil muda à meia-noite local, não à UTC). */
export function todayIn(timezone: string, now: DateTime = DateTime.now()): CivilDate {
  const local = now.setZone(timezone);
  if (!local.isValid) throw new Error(`Fuso inválido: ${timezone}`);
  return local.toISODate() as CivilDate;
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number) as [number, number];
  return hours * 60 + minutes;
}

export function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Bloco não atravessa a meia-noite: início + duração precisa caber no mesmo dia. */
export function endsSameDay(startTime: string, durationMin: number): boolean {
  return timeToMinutes(startTime) + durationMin <= MINUTES_PER_DAY;
}

/**
 * Converte "dia + hora de relógio" em instante UTC no fuso informado. Hora que não existe
 * (adiantamento do horário de verão) avança para a hora válida; hora repetida usa a primeira.
 */
export function localDateTimeToUtc(date: CivilDate, time: string, timezone: string): Date {
  const instant = DateTime.fromISO(`${date}T${time}`, { zone: timezone });
  if (!instant.isValid) throw new Error(`Data/hora ou fuso inválidos: ${date} ${time} ${timezone}`);
  return instant.toUTC().toJSDate();
}
