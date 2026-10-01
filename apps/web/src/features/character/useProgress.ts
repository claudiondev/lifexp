import { useQuery } from '@tanstack/react-query';
import { getProgress } from './progressApi';

export const progressKey = ['progress'] as const;

/** XP e nível geral e por área. Concluir/desfazer invalida esta chave para o HUD atualizar. */
export function useProgress() {
  return useQuery({ queryKey: progressKey, queryFn: getProgress });
}
