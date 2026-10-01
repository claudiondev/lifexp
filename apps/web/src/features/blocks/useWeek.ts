import { useQuery } from '@tanstack/react-query';
import type { CivilDate } from '@lifexp/shared';
import { getWeek } from './blocksApi';

export const blocksKey = ['blocks'] as const;

export function weekQueryOptions(weekStart: CivilDate) {
  return {
    queryKey: [...blocksKey, 'week', weekStart] as const,
    queryFn: () => getWeek(weekStart),
  };
}

export function useWeek(weekStart: CivilDate) {
  return useQuery(weekQueryOptions(weekStart));
}
