import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CivilDate, UpdateEventInput } from '@lifexp/shared';
import * as eventsApi from './eventsApi';

export const eventsKey = ['events'] as const;

export function useEvents(from: CivilDate, to: CivilDate) {
  return useQuery({
    queryKey: [...eventsKey, from, to],
    queryFn: () => eventsApi.listEvents(from, to),
  });
}

export function useEventMutations() {
  const queryClient = useQueryClient();
  // Um evento pode cair em qualquer janela em cache (semana, mês, Hoje): invalida todas.
  const refresh = () => queryClient.invalidateQueries({ queryKey: eventsKey });

  return {
    create: useMutation({ mutationFn: eventsApi.createEvent, onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: UpdateEventInput }) =>
        eventsApi.updateEvent(id, input),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: eventsApi.deleteEvent, onSuccess: refresh }),
  };
}
