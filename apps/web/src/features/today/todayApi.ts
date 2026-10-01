import {
  completionResultSchema,
  todayResponseSchema,
  undoResultSchema,
  type CivilDate,
  type CompletionResult,
  type TodayResponse,
  type UndoResult,
} from '@lifexp/shared';
import { apiJson } from '../../lib/apiClient';

export const getToday = (): Promise<TodayResponse> => apiJson('/today', todayResponseSchema);

const completionPath = (blockId: string, occurrenceDate: CivilDate) =>
  `/blocks/${blockId}/occurrences/${occurrenceDate}/completion`;

/** Concluir é idempotente: repetir devolve a conclusão existente, sem XP novo. */
export const completeOccurrence = (
  blockId: string,
  occurrenceDate: CivilDate,
): Promise<CompletionResult> =>
  apiJson(completionPath(blockId, occurrenceDate), completionResultSchema, { method: 'POST' });

export const undoCompletion = (blockId: string, occurrenceDate: CivilDate): Promise<UndoResult> =>
  apiJson(completionPath(blockId, occurrenceDate), undoResultSchema, { method: 'DELETE' });
