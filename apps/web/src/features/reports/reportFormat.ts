import type { Quest } from '@lifexp/shared';

/** "8 h 15 min", "2 h", "45 min". */
export function durationText(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export const adherenceText = (adherence: number | null): string =>
  adherence === null ? '—' : `${adherence}%`;

/** "+640" ou "0" ou "-20" (o líquido da semana, com estornos). */
export const signedXp = (amount: number): string => (amount > 0 ? `+${amount}` : String(amount));

/** A quest da semana em uma frase, sem cobrança. */
export function questLine(quest: Quest): string {
  if (quest.status === 'none') return 'Esta semana não teve quest.';
  if (quest.status === 'completed') {
    return `Cumprida: ${quest.completed} de ${quest.eligible} blocos, com bônus de ${quest.bonusXp} XP.`;
  }
  return `Em andamento: ${quest.completed} de ${quest.eligible} blocos (a meta são ${quest.target}).`;
}
