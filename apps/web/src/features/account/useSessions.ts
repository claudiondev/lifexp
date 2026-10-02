import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listSessions, revokeOtherSessions, revokeSession } from './accountApi';

export const sessionsKey = ['sessions'] as const;

export function useSessions() {
  return useQuery({ queryKey: sessionsKey, queryFn: listSessions });
}

export function useSessionMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: sessionsKey });
  return {
    revoke: useMutation({ mutationFn: revokeSession, onSuccess: refresh }),
    revokeOthers: useMutation({ mutationFn: revokeOtherSessions, onSuccess: refresh }),
  };
}
