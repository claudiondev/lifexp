import { weekDates, weekdayOf, type CivilDate, type Occurrence } from '@lifexp/shared';

/** Template de bloco como a regra de domínio o enxerga: só dados, sem Prisma nem datas JS. */
export interface BlockTemplate {
  id: string;
  activityId: string;
  areaId: string;
  recurrence: 'weekly' | 'once';
  /** 1 = segunda ... 7 = domingo (só semanal). */
  weekday: number | null;
  /** Data do bloco avulso. */
  date: CivilDate | null;
  startTime: string;
  durationMin: number;
  /** Primeira data em que a regra semanal vale. */
  validFrom: CivilDate | null;
  /** Última data em que a regra vale; nulo = sem fim. */
  validUntil: CivilDate | null;
  /** Meta a que o bloco serve (RF19). Não afeta o cálculo das ocorrências. */
  goalId?: string | null;
}

export interface ExceptionRule {
  blockId: string;
  /** Data original da ocorrência na série. */
  occurrenceDate: CivilDate;
  type: 'skip' | 'override';
  newDate: CivilDate | null;
  newStartTime: string | null;
  newDurationMin: number | null;
}

/** A ocorrência cai nesta data civil? (a regra semanal vale entre validFrom e validUntil, inclusive) */
export function occursOn(block: BlockTemplate, date: CivilDate): boolean {
  if (block.recurrence === 'once') return block.date === date;
  if (block.weekday !== weekdayOf(date)) return false;
  if (block.validFrom !== null && date < block.validFrom) return false;
  if (block.validUntil !== null && date > block.validUntil) return false;
  return true;
}

export interface ResolvedOccurrence {
  /** Dia efetivo (muda se a ocorrência foi movida). */
  date: CivilDate;
  startTime: string;
  durationMin: number;
  skipped: boolean;
  modified: boolean;
}

/**
 * Valores EFETIVOS de uma ocorrência: o do template, com a exceção aplicada por cima (pular marca
 * como pulada; alterar troca dia, horário e/ou duração). É a mesma regra da grade e da conclusão.
 */
export function resolveOccurrence(
  block: Pick<BlockTemplate, 'startTime' | 'durationMin'>,
  rule: ExceptionRule | undefined,
  occurrenceDate: CivilDate,
): ResolvedOccurrence {
  const overridden = rule?.type === 'override';
  return {
    date: overridden ? (rule.newDate ?? occurrenceDate) : occurrenceDate,
    startTime: overridden ? (rule.newStartTime ?? block.startTime) : block.startTime,
    durationMin: overridden ? (rule.newDurationMin ?? block.durationMin) : block.durationMin,
    skipped: rule?.type === 'skip',
    modified: overridden,
  };
}

function compareOccurrences(a: Occurrence, b: Occurrence): number {
  return (
    a.date.localeCompare(b.date) ||
    a.startTime.localeCompare(b.startTime) ||
    a.blockId.localeCompare(b.blockId)
  );
}

/**
 * Calcula, sob demanda, as ocorrências de uma semana (RN31): o banco guarda só o template e as
 * exceções, nunca as ocorrências futuras.
 *
 * Só usa datas civis e horários de relógio, sem fuso (RN36, RN37): o mesmo resultado vale para
 * qualquer fuso, e trocar de fuso preserva o horário local por construção.
 *
 * Invariante garantida pelo banco: uma exceção que muda a data fica na mesma semana da ocorrência
 * original, então toda ocorrência movida continua dentro desta semana.
 *
 * Exceções sem ocorrência correspondente (ex.: a série foi encerrada ou mudou de dia) são ignoradas.
 */
export function computeWeekOccurrences(
  weekStart: CivilDate,
  blocks: readonly BlockTemplate[],
  exceptions: readonly ExceptionRule[],
): Occurrence[] {
  const exceptionByKey = new Map(
    exceptions.map((rule) => [`${rule.blockId}|${rule.occurrenceDate}`, rule]),
  );
  const occurrences: Occurrence[] = [];

  for (const date of weekDates(weekStart)) {
    for (const block of blocks) {
      if (!occursOn(block, date)) continue;

      const resolved = resolveOccurrence(block, exceptionByKey.get(`${block.id}|${date}`), date);

      occurrences.push({
        blockId: block.id,
        occurrenceDate: date,
        date: resolved.date,
        startTime: resolved.startTime,
        durationMin: resolved.durationMin,
        activityId: block.activityId,
        areaId: block.areaId,
        goalId: block.goalId ?? null,
        recurrence: block.recurrence,
        skipped: resolved.skipped,
        modified: resolved.modified,
      });
    }
  }

  return occurrences.sort(compareOccurrences);
}
