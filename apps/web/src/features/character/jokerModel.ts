import type { Joker } from '@lifexp/shared';
import { weekdayLong } from '@/lib/civilFormat';

const shortDate = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/**
 * Texto do coringa semanal (RF26, RN14). Tom sempre positivo: ele existe para a pessoa não perder a
 * sequência por um dia ruim, nunca para cobrar nada.
 */
export function describeJoker(joker: Joker): string {
  if (joker.usedOn === null) {
    return 'Coringa da semana disponível: ele perdoa o primeiro dia perdido, sem custo.';
  }
  return `Coringa da semana usado em ${weekdayLong(joker.usedOn)} (${shortDate(joker.usedOn)}): sua sequência foi protegida.`;
}
