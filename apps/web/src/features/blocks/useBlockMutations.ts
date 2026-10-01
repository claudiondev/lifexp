import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createBlock } from './blocksApi';
import { blocksKey } from './useWeek';

export function useBlockMutations() {
  const queryClient = useQueryClient();
  // Qualquer mudança em blocos pode alterar várias semanas em cache: invalida todas.
  const refresh = () => queryClient.invalidateQueries({ queryKey: blocksKey });

  return {
    create: useMutation({ mutationFn: createBlock, onSuccess: refresh }),
  };
}
