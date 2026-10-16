import { useQuery } from '@tanstack/react-query';
import { progressKey } from '../character/useProgress';
import { getXpEvolution } from './xpEvolutionApi';

/**
 * A chave nasce DENTRO da de progresso, como a do histórico de XP: concluir ou desfazer algo já invalida `progress`,
 * e o gráfico acompanha sem que cada mutação precise lembrar dele.
 */
export const xpEvolutionKey = [...progressKey, 'evolution'] as const;

export function useXpEvolution(weeks: number) {
  return useQuery({
    queryKey: [...xpEvolutionKey, { weeks }],
    queryFn: () => getXpEvolution(weeks),
  });
}
