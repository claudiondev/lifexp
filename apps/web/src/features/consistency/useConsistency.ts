import { useQuery } from '@tanstack/react-query';
import { progressKey } from '../character/useProgress';
import { getConsistency } from './consistencyApi';

/**
 * A chave nasce DENTRO da de progresso, como a do histórico e a da evolução de XP: concluir ou desfazer um bloco já
 * invalida `progress`, e o mapa acompanha sem que cada mutação precise lembrar dele. Pular ou mover blocos (que mudam
 * o "planejado") também invalidam `progress` (ver `useBlockMutations`).
 */
export const consistencyKey = [...progressKey, 'consistency'] as const;

export function useConsistency(weeks: number) {
  return useQuery({
    queryKey: [...consistencyKey, { weeks }],
    queryFn: () => getConsistency(weeks),
  });
}
