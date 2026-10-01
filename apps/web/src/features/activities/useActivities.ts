import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Activity, UpdateActivityInput } from '@lifexp/shared';
import { activitiesKey } from '../areas/useAreas';
import * as activitiesApi from './activitiesApi';

/** Todas as atividades de uma vez; o agrupamento por área é feito no cliente. */
export function useActivities(includeArchived: boolean) {
  return useQuery({
    queryKey: [...activitiesKey, { includeArchived }],
    queryFn: () => activitiesApi.listActivities(includeArchived),
  });
}

export function groupByArea(activities: Activity[]): Map<string, Activity[]> {
  const groups = new Map<string, Activity[]>();
  for (const activity of activities) {
    groups.set(activity.areaId, [...(groups.get(activity.areaId) ?? []), activity]);
  }
  return groups;
}

export function useActivityMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: activitiesKey });

  return {
    create: useMutation({ mutationFn: activitiesApi.createActivity, onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: UpdateActivityInput }) =>
        activitiesApi.updateActivity(id, input),
      onSuccess: refresh,
    }),
    archive: useMutation({ mutationFn: activitiesApi.archiveActivity, onSuccess: refresh }),
    unarchive: useMutation({ mutationFn: activitiesApi.unarchiveActivity, onSuccess: refresh }),
  };
}
