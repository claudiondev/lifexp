import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CivilDate } from '@lifexp/shared';
import { progressKey } from '../character/useProgress';
import { blocksKey } from '../blocks/useWeek';
import { completeOccurrence, undoCompletion } from './todayApi';
import { balanceKey } from '../balance/useBalance';
import { questKey } from '../quest/useQuest';
import { reviewsKey } from '../reviews/useReviews';
import { todayKey } from './useToday';

interface OccurrenceRef {
  blockId: string;
  /** Data ORIGINAL da ocorrência (a identidade dela, RN32). */
  occurrenceDate: CivilDate;
}

export function useCompletionMutations() {
  const queryClient = useQueryClient();
  // Concluir/desfazer muda a lista de hoje, o XP/nível (HUD, ficha, áreas), o ✓ da Semana, a quest e o radar.
  const refresh = () =>
    Promise.all(
      [todayKey, progressKey, blocksKey, reviewsKey, questKey, balanceKey].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );

  return {
    complete: useMutation({
      mutationFn: ({ blockId, occurrenceDate }: OccurrenceRef) =>
        completeOccurrence(blockId, occurrenceDate),
      onSuccess: refresh,
    }),
    undo: useMutation({
      mutationFn: ({ blockId, occurrenceDate }: OccurrenceRef) =>
        undoCompletion(blockId, occurrenceDate),
      onSuccess: refresh,
    }),
  };
}
