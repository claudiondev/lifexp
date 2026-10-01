import { useQuery } from '@tanstack/react-query';
import { getToday } from './todayApi';

export const todayKey = ['today'] as const;

/**
 * O servidor decide o status (upcoming/open/closed) pelo relógio dele; por isso a lista é buscada
 * de novo a cada minuto, e o que era "ainda não começou" vira "dá para concluir" sem recarregar.
 */
export function useToday() {
  return useQuery({ queryKey: todayKey, queryFn: getToday, refetchInterval: 60_000 });
}
