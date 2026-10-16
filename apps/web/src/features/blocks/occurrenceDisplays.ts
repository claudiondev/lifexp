import type { Activity, Area, WeekResponse } from '@lifexp/shared';
import type { OccurrenceDisplay } from './OccurrenceCard';

/**
 * Junta o que a API devolve (ocorrências, conclusões) com os nomes e cores da atividade e da área, no formato que a
 * Semana e o Mês desenham. Atividade ou área que não aparecem na lista (ex.: excluídas) caem em valores neutros em vez
 * de esconder o bloco. A conclusão liga pela data ORIGINAL da ocorrência (`blockId:occurrenceDate`, RN32).
 */
export function toOccurrenceDisplays(
  data: Pick<WeekResponse, 'occurrences' | 'completions'>,
  activities: readonly Pick<Activity, 'id' | 'name'>[],
  areas: readonly Pick<Area, 'id' | 'name' | 'color' | 'icon'>[],
): OccurrenceDisplay[] {
  const activityById = new Map(activities.map((activity) => [activity.id, activity]));
  const areaById = new Map(areas.map((area) => [area.id, area]));
  const completionByOccurrence = new Map(
    data.completions.map((completion) => [
      `${completion.blockId}:${completion.occurrenceDate}`,
      completion,
    ]),
  );
  return data.occurrences.map((occurrence) => {
    const area = areaById.get(occurrence.areaId);
    return {
      occurrence,
      activityName: activityById.get(occurrence.activityId)?.name ?? 'Atividade',
      areaName: area?.name ?? 'Área',
      areaColor: area?.color ?? 'slate',
      areaIcon: area?.icon ?? 'star',
      completion: completionByOccurrence.get(`${occurrence.blockId}:${occurrence.occurrenceDate}`),
    };
  });
}
