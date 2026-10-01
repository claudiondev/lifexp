import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateAreaInput } from '@lifexp/shared';
import * as areasApi from './areasApi';

export const areasKey = ['areas'] as const;
export const activitiesKey = ['activities'] as const;

export function useAreas(includeArchived: boolean) {
  return useQuery({
    queryKey: [...areasKey, { includeArchived }],
    queryFn: () => areasApi.listAreas(includeArchived),
  });
}

export function useAreaMutations() {
  const queryClient = useQueryClient();
  // Arquivar/restaurar uma área muda também quais atividades aparecem, então invalida as duas.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: areasKey }),
      queryClient.invalidateQueries({ queryKey: activitiesKey }),
    ]);

  return {
    create: useMutation({ mutationFn: areasApi.createArea, onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: UpdateAreaInput }) =>
        areasApi.updateArea(id, input),
      onSuccess: refresh,
    }),
    archive: useMutation({ mutationFn: areasApi.archiveArea, onSuccess: refresh }),
    unarchive: useMutation({ mutationFn: areasApi.unarchiveArea, onSuccess: refresh }),
  };
}
