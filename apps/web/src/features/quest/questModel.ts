import type { Quest } from '@lifexp/shared';

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export interface QuestView {
  /** Frase principal do cartão. */
  headline: string;
  /** Linha de apoio: o que falta, ou o que já foi ganho. Sempre positiva, sem culpa. */
  detail: string;
  /** Preenchimento da barra, de 0 a 1. */
  progress: number;
}

/** O cartão só aparece quando a semana tem quest (RF22); `none` não mostra nada. */
export const hasQuest = (quest: Quest | undefined): quest is Quest =>
  quest !== undefined && quest.status !== 'none';

/** Textos do cartão. Pular um bloco o tira da conta, então nunca vira cobrança (RN18). */
export function describeQuest(quest: Quest): QuestView {
  const progress = quest.ratio ?? 0;
  if (quest.status === 'completed') {
    return {
      headline: 'Quest da semana cumprida!',
      detail: `Bônus de ${quest.bonusXp} XP garantido. Cada bloco a mais mostra constância.`,
      progress,
    };
  }
  if (quest.eligible === 0) {
    return {
      headline: 'Quest da semana',
      detail: 'Todos os blocos da quest foram pulados: nada a cobrar nesta semana.',
      progress,
    };
  }
  const missing = Math.max(0, quest.target - quest.completed);
  return {
    headline: 'Quest da semana',
    detail: `Faltam ${plural(missing, 'bloco', 'blocos')} para o bônus de ${quest.bonusXp} XP (${plural(quest.completed, 'concluído', 'concluídos')} de ${quest.eligible}).`,
    progress,
  };
}
