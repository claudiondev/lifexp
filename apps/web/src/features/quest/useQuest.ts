import { useQuery } from '@tanstack/react-query';
import { getQuest } from './questApi';

export const questKey = ['quest'] as const;

/**
 * A quest da semana atual. Concluir, desfazer, pular e editar blocos mudam a conta dela, então todas
 * essas mutações invalidam esta chave (veja `useCompletionMutations` e `useBlockMutations`).
 */
export function useQuest() {
  return useQuery({ queryKey: questKey, queryFn: getQuest });
}
