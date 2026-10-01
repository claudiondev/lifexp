import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CivilDate, PutExceptionInput, UpdateBlockInput } from '@lifexp/shared';
import { createBlock, deleteBlock, putException, removeException, updateBlock } from './blocksApi';
import { blocksKey } from './useWeek';

interface OccurrenceRef {
  blockId: string;
  /** Data ORIGINAL da ocorrência na série (a identidade dela, RN32). */
  occurrenceDate: CivilDate;
}

export function useBlockMutations() {
  const queryClient = useQueryClient();
  // Qualquer mudança em blocos pode alterar várias semanas em cache: invalida todas.
  const refresh = () => queryClient.invalidateQueries({ queryKey: blocksKey });

  return {
    create: useMutation({ mutationFn: createBlock, onSuccess: refresh }),
    edit: useMutation({
      mutationFn: ({ blockId, input }: { blockId: string; input: UpdateBlockInput }) =>
        updateBlock(blockId, input),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: ({ blockId, from }: { blockId: string; from: CivilDate }) =>
        deleteBlock(blockId, from),
      onSuccess: refresh,
    }),
    /** Pular e alterar só uma ocorrência são o mesmo recurso (a exceção), com tipos diferentes. */
    setException: useMutation({
      mutationFn: ({
        blockId,
        occurrenceDate,
        input,
      }: OccurrenceRef & { input: PutExceptionInput }) =>
        putException(blockId, occurrenceDate, input),
      onSuccess: refresh,
    }),
    restore: useMutation({
      mutationFn: ({ blockId, occurrenceDate }: OccurrenceRef) =>
        removeException(blockId, occurrenceDate),
      onSuccess: refresh,
    }),
  };
}
