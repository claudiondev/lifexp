import {
  blockSchema,
  weekResponseSchema,
  type Block,
  type CivilDate,
  type CreateBlockInput,
  type WeekResponse,
} from '@lifexp/shared';
import { apiJson } from '../../lib/apiClient';

export const getWeek = (weekStart: CivilDate): Promise<WeekResponse> =>
  apiJson(`/blocks/week?weekStart=${weekStart}`, weekResponseSchema);

export const createBlock = (input: CreateBlockInput): Promise<Block> =>
  apiJson('/blocks', blockSchema, { method: 'POST', json: input });
