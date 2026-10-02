import { addDays, weekStartOf, type CivilDate, type WeekTotals } from '@lifexp/shared';
import { formatDuration } from '../blocks/blockOptions';

/** "75%", ou "—" quando nada foi planejado (não existe "0%" de nada). */
export function formatAdherence(ratio: number | null): string {
  return ratio === null ? '—' : `${Math.round(ratio * 100)}%`;
}

/** "3 de 4 blocos cumpridos" / "1 de 1 bloco cumprido". */
export function completedText(planned: number, completed: number): string {
  return `${completed} de ${planned} ${planned === 1 ? 'bloco cumprido' : 'blocos cumpridos'}`;
}

/** "1 h 30 min de 3 h": o tempo cumprido sobre o planejado. */
export function minutesText(plannedMin: number, completedMin: number): string {
  return `${completedMin === 0 ? '0 min' : formatDuration(completedMin)} de ${
    plannedMin === 0 ? '0 min' : formatDuration(plannedMin)
  }`;
}

/** "+90 XP" ou "−60 XP" (sinal de menos tipográfico; XP líquido da semana). */
export function xpText(xp: number): string {
  return `${xp < 0 ? '−' : '+'}${Math.abs(xp)} XP`;
}

/**
 * Sobre os pulados: informativo e sem culpa. Pular é uma decisão e não pesa na aderência (RN11).
 * Devolve nulo quando não houve nenhum.
 */
export function skippedText(skipped: number): string | null {
  if (skipped === 0) return null;
  const count = skipped === 1 ? '1 bloco foi pulado' : `${skipped} blocos foram pulados`;
  return `${count}. Pular não pesa na sua aderência.`;
}

export function hasPlans(totals: WeekTotals): boolean {
  return totals.planned > 0;
}

/**
 * A semana mostrada: a da URL (qualquer data vira a segunda-feira dela), nunca depois da atual
 * (não há o que revisar numa semana que não começou) e, se for inválida ou ausente, a atual.
 */
export function resolveReviewWeek(param: string | null, currentWeek: CivilDate): CivilDate {
  if (!param || !/^\d{4}-\d{2}-\d{2}$/.test(param)) return currentWeek;
  let week: CivilDate;
  try {
    week = weekStartOf(param);
  } catch {
    return currentWeek;
  }
  return week > currentWeek ? currentWeek : week;
}

export const previousWeekOf = (weekStart: CivilDate): CivilDate => addDays(weekStart, -7);
export const nextWeekOf = (weekStart: CivilDate): CivilDate => addDays(weekStart, 7);
