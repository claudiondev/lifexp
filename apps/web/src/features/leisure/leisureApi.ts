import { z } from 'zod';
import {
  leisureOptionSchema,
  leisureSessionSchema,
  leisureSummarySchema,
  type CreateLeisureOptionInput,
  type LeisureOption,
  type LeisureSession,
  type LeisureSummary,
  type UpdateLeisureOptionInput,
} from '@lifexp/shared';
import { apiJson } from '../../lib/apiClient';

export const getLeisure = (): Promise<LeisureSummary> => apiJson('/leisure', leisureSummarySchema);

/** Com `includeArchived`, traz também os arquivados (as sessões antigas apontam para eles). */
export const listLeisureOptions = (includeArchived: boolean): Promise<LeisureOption[]> =>
  apiJson(
    `/leisure/options${includeArchived ? '?includeArchived=true' : ''}`,
    z.array(leisureOptionSchema),
  );

export const createLeisureOption = (input: CreateLeisureOptionInput): Promise<LeisureOption> =>
  apiJson('/leisure/options', leisureOptionSchema, { method: 'POST', json: input });

export const updateLeisureOption = (
  id: string,
  input: UpdateLeisureOptionInput,
): Promise<LeisureOption> =>
  apiJson(`/leisure/options/${id}`, leisureOptionSchema, { method: 'PATCH', json: input });

export const startLeisureSession = (optionId: string): Promise<LeisureSession> =>
  apiJson('/leisure/sessions', leisureSessionSchema, { method: 'POST', json: { optionId } });

/** Parar é idempotente: repetir devolve a sessão como está. */
export const stopLeisureSession = (id: string): Promise<LeisureSession> =>
  apiJson(`/leisure/sessions/${id}/stop`, leisureSessionSchema, { method: 'POST' });
