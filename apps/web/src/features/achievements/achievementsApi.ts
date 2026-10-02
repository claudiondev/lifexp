import { achievementListSchema, type Achievement } from '@lifexp/shared';
import { apiJson } from '../../lib/apiClient';

export const listAchievements = (): Promise<Achievement[]> =>
  apiJson('/achievements', achievementListSchema);
