import type { Completion } from '@lifexp/shared';
import { toCivil } from '../blocks/blocks.mapper.js';
import type { Completion as CompletionEntity } from '../generated/prisma/client.js';

export function toCompletionDto(row: CompletionEntity): Completion {
  return {
    blockId: row.blockId,
    occurrenceDate: toCivil(row.occurrenceDate),
    completedAt: row.completedAt.toISOString(),
    xpAmount: row.xpAmount,
  };
}
