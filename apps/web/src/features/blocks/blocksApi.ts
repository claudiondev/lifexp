import { weekResponseSchema, type CivilDate, type WeekResponse } from '@lifexp/shared';
import { apiJson } from '../../lib/apiClient';

export const getWeek = (weekStart: CivilDate): Promise<WeekResponse> =>
  apiJson(`/blocks/week?weekStart=${weekStart}`, weekResponseSchema);
