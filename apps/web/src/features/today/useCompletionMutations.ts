import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CivilDate } from '@lifexp/shared';
import { progressKey } from '../character/useProgress';
import { blocksKey } from '../blocks/useWeek';
import { completeOccurrence, undoCompletion } from './todayApi';
import { achievementsKey } from '../achievements/useAchievements';
import { balanceKey } from '../balance/useBalance';
import { questKey } from '../quest/useQuest';
import { reviewsKey } from '../reviews/useReviews';
import { rewardsKey } from '../rewards/useRewards';
import { todayKey } from './useToday';

interface OccurrenceRef {
  blockId: string;
  /** Data ORIGINAL da ocorrência (a identidade dela, RN32). */
  occurrenceDate: CivilDate;
}

export function useCompletionMutations() {
  const queryClient = useQueryClient();
  // Concluir/desfazer muda a lista de hoje, o XP/nível (HUD, ficha, áreas), o ✓ da Semana, a quest, o radar,
  // as conquistas e as recompensas.
  const refresh = () =>
    Promise.all(
      [
        todayKey,
        progressKey,
        blocksKey,
        reviewsKey,
        questKey,
        balanceKey,
        achievementsKey,
        rewardsKey,
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
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
