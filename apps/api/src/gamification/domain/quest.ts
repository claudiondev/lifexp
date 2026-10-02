import {
  QUEST_BONUS_PERCENT,
  QUEST_TARGET_PERCENT,
  QUEST_TIERS,
  calculateXp,
  type CivilDate,
  type QuestTier,
} from '@lifexp/shared';

/** Teto do bônus semanal: o valor depende de calibração, então uma semana enorme não distorce o XP. */
export const QUEST_BONUS_CAP = 1000;

export const itemKey = (blockId: string, occurrenceDate: CivilDate): string =>
  `${blockId}:${occurrenceDate}`;

/** Uma ocorrência como o snapshot a guarda. */
export interface QuestItemInput {
  blockId: string;
  /** Data ORIGINAL da ocorrência na série (RN32). */
  occurrenceDate: CivilDate;
  /** XP previsto quando o snapshot foi tirado. */
  xp: number;
}

export interface QuestEvaluation {
  /** Blocos do snapshot que seguem planejados (pular tira da conta; criar depois nunca põe, RN18). */
  eligible: number;
  completed: number;
  /** Quantos bastam para cumprir a quest. */
  target: number;
  ratio: number | null;
  /** Cumprida: há blocos elegíveis e o mínimo foi atingido. */
  met: boolean;
  bonusXp: number;
  tiers: QuestTier[];
}

/**
 * Quantos de `eligible` blocos são `percent`% deles, arredondado PARA CIMA. Só aritmética inteira
 * (`n * percent / 100` com inteiros dá o quociente exato quando ele é inteiro; nada de `0.8 * n`).
 */
export function requiredCount(eligible: number, percent: number): number {
  return Math.ceil((eligible * percent) / 100);
}

/** O bônus: 20% do XP previsto dos blocos elegíveis, arredondado e limitado entre 1 e o teto (RN17). */
export function bonusFor(eligibleXp: number): number {
  if (eligibleXp <= 0) return 0;
  // Pelo menos 1: o livro-caixa não aceita lançamento de valor zero (e quem cumpriu a quest merece algo).
  return Math.min(
    Math.max(Math.round((eligibleXp * QUEST_BONUS_PERCENT) / 100), 1),
    QUEST_BONUS_CAP,
  );
}

/**
 * Avalia a quest (RN16 a RN18, RN34) contra o plano e as conclusões de agora.
 *
 * - Elegível = item do snapshot que continua planejado (`planned`). Um bloco pulado ou removido sai da
 *   conta em vez de pesar contra a pessoa; um bloco novo nunca entra.
 * - Cumprido = elegível com conclusão ativa.
 * - Sem nenhum elegível não há quest a cumprir (`met` falso, bônus 0): nunca "cumpre" de graça.
 */
export function evaluateQuest(input: {
  items: readonly QuestItemInput[];
  planned: ReadonlySet<string>;
  completed: ReadonlySet<string>;
}): QuestEvaluation {
  const eligibleItems = input.items.filter((item) =>
    input.planned.has(itemKey(item.blockId, item.occurrenceDate)),
  );
  const eligible = eligibleItems.length;
  const completed = eligibleItems.filter((item) =>
    input.completed.has(itemKey(item.blockId, item.occurrenceDate)),
  ).length;
  const target = requiredCount(eligible, QUEST_TARGET_PERCENT);
  const reached = (percent: number) =>
    eligible > 0 && completed >= requiredCount(eligible, percent);

  return {
    eligible,
    completed,
    target,
    ratio: eligible > 0 ? completed / eligible : null,
    met: reached(QUEST_TARGET_PERCENT),
    bonusXp: eligible > 0 ? bonusFor(eligibleItems.reduce((sum, item) => sum + item.xp, 0)) : 0,
    tiers: QUEST_TIERS.map((percent) => ({
      percent,
      requiredCount: requiredCount(eligible, percent),
      reached: reached(percent),
    })),
  };
}

/** Uma ocorrência já calculada da semana, como o snapshot precisa dela. */
export interface SnapshotOccurrence {
  blockId: string;
  occurrenceDate: CivilDate;
  durationMin: number;
  activityId: string;
  skipped: boolean;
}

/**
 * Os itens do snapshot (RN16): as ocorrências planejadas da semana (as puladas não entram) com o XP que cada
 * uma renderia, pelo peso da atividade de agora. Atividade sem peso conhecido usa o peso padrão 1.
 */
export function buildSnapshot(
  occurrences: readonly SnapshotOccurrence[],
  weightOf: ReadonlyMap<string, number>,
): (QuestItemInput & { durationMin: number })[] {
  return occurrences
    .filter((occurrence) => !occurrence.skipped)
    .map((occurrence) => ({
      blockId: occurrence.blockId,
      occurrenceDate: occurrence.occurrenceDate,
      durationMin: occurrence.durationMin,
      xp: calculateXp({
        durationMin: occurrence.durationMin,
        xpWeight: weightOf.get(occurrence.activityId) ?? 1,
      }),
    }));
}
