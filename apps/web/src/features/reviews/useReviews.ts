import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CivilDate, UpdateReviewInput } from '@lifexp/shared';
import { getReview, listReviews, saveReview } from './reviewsApi';

/**
 * O resumo da semana nasce de blocos e conclusões, então concluir, desfazer ou editar blocos também
 * invalida esta chave (veja `useCompletionMutations` e `useBlockMutations`).
 */
export const reviewsKey = ['reviews'] as const;

export function useReview(weekStart: CivilDate) {
  return useQuery({
    queryKey: [...reviewsKey, 'week', weekStart],
    queryFn: () => getReview(weekStart),
  });
}

export function useReviewHistory() {
  return useInfiniteQuery({
    queryKey: [...reviewsKey, 'history'],
    queryFn: ({ pageParam }) => listReviews(pageParam),
    initialPageParam: undefined as CivilDate | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useSaveReview(weekStart: CivilDate) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateReviewInput) => saveReview(weekStart, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reviewsKey }),
  });
}
