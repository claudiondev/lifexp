import { useQuery } from '@tanstack/react-query';
import type { CivilDate } from '@lifexp/shared';
import { reviewsKey } from '../reviews/useReviews';
import { getWeeklyReport } from './reportsApi';

/**
 * A chave nasce DENTRO da chave de revisões de propósito: concluir, desfazer, pular e editar blocos já a invalidam,
 * e o relatório muda com todos eles. Assim ele acompanha sem que cada mutação precise lembrar dele.
 */
export function useWeeklyReport(weekStart: CivilDate) {
  return useQuery({
    queryKey: [...reviewsKey, 'report', weekStart],
    queryFn: () => getWeeklyReport(weekStart),
  });
}
