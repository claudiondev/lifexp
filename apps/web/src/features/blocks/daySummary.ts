import type { AreaColor, CivilDate } from '@lifexp/shared';
import type { OccurrenceDisplay } from './OccurrenceCard';

export interface AreaShare {
  color: AreaColor;
  minutes: number;
}

export interface DaySummary {
  /** Blocos do dia que valem (pulado não conta: a pessoa já decidiu). */
  planned: number;
  /** Quantos desses já têm conclusão ativa. */
  done: number;
  plannedMinutes: number;
  /** Minutos por cor de área, do maior para o menor (desempate pela cor, para a ordem ser estável). */
  areas: AreaShare[];
}

/** Resume um dia para o cabeçalho da grade e das abas do celular. */
export function summarizeDay(items: readonly OccurrenceDisplay[], date: CivilDate): DaySummary {
  const minutesByColor = new Map<AreaColor, number>();
  let planned = 0;
  let done = 0;
  let plannedMinutes = 0;

  for (const { occurrence, completion, areaColor } of items) {
    if (occurrence.date !== date || occurrence.skipped) continue;
    planned += 1;
    if (completion) done += 1;
    plannedMinutes += occurrence.durationMin;
    minutesByColor.set(areaColor, (minutesByColor.get(areaColor) ?? 0) + occurrence.durationMin);
  }

  const areas = [...minutesByColor]
    .map(([color, minutes]) => ({ color, minutes }))
    .sort((a, b) => b.minutes - a.minutes || a.color.localeCompare(b.color));

  return { planned, done, plannedMinutes, areas };
}
