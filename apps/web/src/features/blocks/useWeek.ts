import { useQuery } from '@tanstack/react-query';
import type { CivilDate } from '@lifexp/shared';
import { getRange, getWeek } from './blocksApi';

export const blocksKey = ['blocks'] as const;

export function weekQueryOptions(weekStart: CivilDate) {
  return {
    queryKey: [...blocksKey, 'week', weekStart] as const,
    queryFn: () => getWeek(weekStart),
  };
}

export function useWeek(weekStart: CivilDate) {
  return useQuery(weekQueryOptions(weekStart));
}

/**
 * Blocos de várias semanas (o calendário do mês). A chave fica DENTRO de `blocksKey`, então toda mutação de bloco e
 * concluir/desfazer (que já invalidam `blocks`) atualizam o mês sem precisar saber dele.
 */
export function useRange(weekStart: CivilDate, weeks: number) {
  return useQuery({
    queryKey: [...blocksKey, 'range', weekStart, weeks] as const,
    queryFn: () => getRange(weekStart, weeks),
  });
}
