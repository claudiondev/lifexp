import { useQuery } from '@tanstack/react-query';
import { getBalance } from './balanceApi';

export const balanceKey = ['balance'] as const;

/**
 * O radar de equilíbrio (RF24). Concluir, desfazer, pular e editar blocos mudam as notas, então todas
 * essas mutações invalidam esta chave (veja `useCompletionMutations` e `useBlockMutations`).
 */
export function useBalance() {
  return useQuery({ queryKey: balanceKey, queryFn: getBalance });
}
