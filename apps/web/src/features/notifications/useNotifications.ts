import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './notificationsApi';

export const notificationsKey = ['notifications'] as const;
const unreadKey = [...notificationsKey, 'unread'] as const;
const listKey = [...notificationsKey, 'list'] as const;

/** Avisos nascem no servidor a cada minuto; consultar de minuto em minuto basta (sem WebSocket). */
export const POLL_MS = 60_000;

export function useUnreadCount() {
  return useQuery({
    queryKey: unreadKey,
    queryFn: api.getUnreadCount,
    refetchInterval: POLL_MS,
  });
}

/** A lista só é buscada com o painel aberto (`enabled`); "carregar mais" usa o cursor (RNF08). */
export function useNotificationList(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: listKey,
    queryFn: ({ pageParam }) => api.listNotifications(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
}

export function useNotificationMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: notificationsKey });
  return {
    markRead: useMutation({ mutationFn: api.markNotificationRead, onSuccess: refresh }),
    markAllRead: useMutation({ mutationFn: api.markAllNotificationsRead, onSuccess: refresh }),
  };
}

const preferencesKey = [...notificationsKey, 'preferences'] as const;

export function useNotificationPreferences() {
  return useQuery({ queryKey: preferencesKey, queryFn: api.getNotificationPreferences });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.updateNotificationPreferences,
    // A resposta já traz as preferências completas: dispensa uma nova consulta.
    onSuccess: (preferences) => queryClient.setQueryData(preferencesKey, preferences),
  });
}
