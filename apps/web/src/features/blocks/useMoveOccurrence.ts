import { useQueryClient } from '@tanstack/react-query';
import type { CivilDate, Occurrence, WeekResponse } from '@lifexp/shared';
import { toast } from 'sonner';
import { ApiError } from '@/lib/apiClient';
import { useBlockMutations } from './useBlockMutations';
import { weekQueryOptions } from './useWeek';

export interface MoveTarget {
  date: CivilDate;
  startTime: string;
}

const same = (a: Occurrence, b: Occurrence) =>
  a.blockId === b.blockId && a.occurrenceDate === b.occurrenceDate;

/**
 * Mover uma ocorrência arrastando (RF18) é o mesmo que "alterar só esta": uma exceção `override`.
 * A série não muda. A grade atualiza na hora (otimista) e volta ao lugar se o servidor recusar.
 */
export function useMoveOccurrence(weekStart: CivilDate) {
  const queryClient = useQueryClient();
  const { setException } = useBlockMutations();

  return async (occurrence: Occurrence, target: MoveTarget): Promise<void> => {
    if (target.date === occurrence.date && target.startTime === occurrence.startTime) return;

    const { queryKey } = weekQueryOptions(weekStart);
    // Uma busca em andamento poderia chegar depois e desfazer a posição otimista.
    await queryClient.cancelQueries({ queryKey });
    const previous = queryClient.getQueryData<WeekResponse>(queryKey);
    queryClient.setQueryData<WeekResponse>(queryKey, (week) =>
      week
        ? {
            ...week,
            occurrences: week.occurrences.map((item) =>
              same(item, occurrence) ? { ...item, ...target, modified: true } : item,
            ),
          }
        : week,
    );

    try {
      await setException.mutateAsync({
        blockId: occurrence.blockId,
        occurrenceDate: occurrence.occurrenceDate,
        // O PUT substitui a exceção inteira: a duração vai junto para não se perder uma duração
        // já alterada antes só para esta ocorrência.
        input: {
          type: 'override',
          newDate: target.date,
          newStartTime: target.startTime,
          newDurationMin: occurrence.durationMin,
        },
      });
      toast.success('Ocorrência movida', { description: 'Só esta vez; a série não mudou.' });
    } catch (error) {
      queryClient.setQueryData(queryKey, previous);
      toast.error('Não foi possível mover o bloco', {
        description: error instanceof ApiError ? error.message : 'Verifique a conexão.',
      });
    }
  };
}
