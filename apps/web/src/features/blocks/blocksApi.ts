import {
  blockExceptionSchema,
  blockSchema,
  weekResponseSchema,
  type Block,
  type BlockException,
  type CivilDate,
  type CreateBlockInput,
  type PutExceptionInput,
  type UpdateBlockInput,
  type WeekResponse,
} from '@lifexp/shared';
import { apiFetch, apiJson } from '../../lib/apiClient';

export const getWeek = (weekStart: CivilDate): Promise<WeekResponse> =>
  apiJson(`/blocks/week?weekStart=${weekStart}`, weekResponseSchema);

export const createBlock = (input: CreateBlockInput): Promise<Block> =>
  apiJson('/blocks', blockSchema, { method: 'POST', json: input });

/** Edita a partir de `input.from` (esta e as próximas); o passado não muda. */
export const updateBlock = (id: string, input: UpdateBlockInput): Promise<Block> =>
  apiJson(`/blocks/${id}`, blockSchema, { method: 'PATCH', json: input });

/** Exclui a partir de `from`; excluir de novo não é erro (idempotente). */
export async function deleteBlock(id: string, from: CivilDate): Promise<void> {
  await apiFetch(`/blocks/${id}?from=${from}`, { method: 'DELETE' });
}

/** Pula ou altera só a ocorrência cuja data ORIGINAL é `occurrenceDate`. */
export const putException = (
  blockId: string,
  occurrenceDate: CivilDate,
  input: PutExceptionInput,
): Promise<BlockException> =>
  apiJson(`/blocks/${blockId}/exceptions/${occurrenceDate}`, blockExceptionSchema, {
    method: 'PUT',
    json: input,
  });

/** Restaura a ocorrência original (desfaz pular ou alterar). */
export async function removeException(blockId: string, occurrenceDate: CivilDate): Promise<void> {
  await apiFetch(`/blocks/${blockId}/exceptions/${occurrenceDate}`, { method: 'DELETE' });
}
