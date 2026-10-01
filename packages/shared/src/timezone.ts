import { IANAZone } from 'luxon';

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/** Valida um identificador de fuso IANA (ex.: "America/Sao_Paulo"). */
export function isValidTimezone(value: string): boolean {
  return IANAZone.isValidZone(value);
}
