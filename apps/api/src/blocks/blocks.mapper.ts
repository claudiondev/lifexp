import type { Block, BlockException, CivilDate } from '@lifexp/shared';
import type {
  Block as BlockEntity,
  BlockException as ExceptionEntity,
} from '../generated/prisma/client.js';
import type { BlockTemplate, ExceptionRule } from './domain/week-occurrences.js';

/**
 * Colunas DATE do Postgres chegam como Date em UTC meia-noite. Datas civis não têm fuso (RN36),
 * então a conversão usa sempre UTC; usar o fuso local deslocaria o dia.
 */
export const toCivil = (date: Date): CivilDate => date.toISOString().slice(0, 10);
export const fromCivil = (date: CivilDate): Date => new Date(`${date}T00:00:00.000Z`);
const toCivilOrNull = (date: Date | null): CivilDate | null => (date ? toCivil(date) : null);

export function toBlockResponse(block: BlockEntity): Block {
  return {
    id: block.id,
    activityId: block.activityId,
    recurrence: block.recurrence === 'WEEKLY' ? 'weekly' : 'once',
    weekday: block.weekday,
    date: toCivilOrNull(block.date),
    startTime: block.startTime,
    durationMin: block.durationMin,
    validFrom: toCivilOrNull(block.validFrom),
    validUntil: toCivilOrNull(block.validUntil),
    goalId: block.goalId,
  };
}

export function toBlockTemplate(block: BlockEntity, areaId: string): BlockTemplate {
  const response = toBlockResponse(block);
  return { ...response, areaId };
}

export function toExceptionRule(rule: ExceptionEntity): ExceptionRule {
  return {
    blockId: rule.blockId,
    occurrenceDate: toCivil(rule.occurrenceDate),
    type: rule.type === 'SKIP' ? 'skip' : 'override',
    newDate: toCivilOrNull(rule.newDate),
    newStartTime: rule.newStartTime,
    newDurationMin: rule.newDurationMin,
  };
}

export function toExceptionResponse(rule: ExceptionEntity): BlockException {
  return toExceptionRule(rule);
}
