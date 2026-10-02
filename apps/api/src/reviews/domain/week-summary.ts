import { settledThrough } from '../../gamification/domain/streak.js';
import {
  addDays,
  localDateTimeToUtc,
  type AreaAdherence,
  type AreaColor,
  type AreaIcon,
  type CivilDate,
  type WeekSummary,
} from '@lifexp/shared';

/** O que o resumo precisa de uma ocorrência já calculada da semana. */
export interface PlannedOccurrence {
  blockId: string;
  /** Data ORIGINAL da ocorrência na série: com o bloco, é a identidade dela (RN32). */
  occurrenceDate: CivilDate;
  /** Dia efetivo (muda se a ocorrência foi movida); sem ele vale a data original. */
  date?: CivilDate;
  areaId: string;
  durationMin: number;
  skipped: boolean;
}

export interface SummaryArea {
  id: string;
  name: string;
  color: AreaColor;
  icon: AreaIcon;
}

export interface WeekSummaryInput {
  weekStart: CivilDate;
  occurrences: readonly PlannedOccurrence[];
  /** Conclusões ativas (não desfeitas) da semana, como `completionKey`. */
  completed: ReadonlySet<string>;
  /** As áreas na ordem em que devem aparecer (inclusive as arquivadas: blocos antigos continuam nelas). */
  areas: readonly SummaryArea[];
  /** XP líquido da semana (ganhos menos estornos). */
  xp: number;
  /**
   * O dia de hoje da pessoa. Com ele, o que ainda dá tempo de cumprir (hoje, ontem e o que vem depois) só entra como
   * "planejado" quando já foi concluído: assim a aderência bate com a do relatório, do radar e do streak (RN42) e não
   * mostra 0% numa área cujo bloco simplesmente ainda não aconteceu. Sem ele, tudo o que não foi pulado conta.
   */
  today?: CivilDate;
}

export const completionKey = (blockId: string, occurrenceDate: CivilDate): string =>
  `${blockId}:${occurrenceDate}`;

/** Cumpridos sobre planejados, ou nulo quando nada foi planejado (não existe "0%" de nada). */
export function adherenceOf(planned: number, completed: number): number | null {
  return planned > 0 ? completed / planned : null;
}

/**
 * Resumo de aderência da semana (RF46): quanto foi planejado e quanto foi cumprido, no total e por área.
 *
 * - Ocorrência PULADA nunca conta como planejada (RN11: pular não gera punição); só entra em `skipped`.
 * - "Cumprida" é planejada com conclusão ativa. Os minutos são os da própria ocorrência (planejados e
 *   cumpridos usam a mesma medida, então a aderência em minutos nunca passa de 100%).
 * - Só aparecem as áreas que tiveram algo planejado; a ordem é a das áreas recebidas.
 */
export function computeWeekSummary(input: WeekSummaryInput): WeekSummary {
  const byArea = new Map<string, AreaAdherence>();
  for (const area of input.areas) {
    byArea.set(area.id, {
      areaId: area.id,
      name: area.name,
      color: area.color,
      icon: area.icon,
      planned: 0,
      completed: 0,
      plannedMin: 0,
      completedMin: 0,
      adherence: null,
    });
  }

  let skipped = 0;
  const totals = { planned: 0, completed: 0, plannedMin: 0, completedMin: 0 };
  for (const occurrence of input.occurrences) {
    if (occurrence.skipped) {
      skipped += 1;
      continue;
    }
    const done = input.completed.has(completionKey(occurrence.blockId, occurrence.occurrenceDate));
    // O que não foi cumprido e ainda está dentro do prazo (ou por vir) não pesa na aderência.
    const effectiveDate = occurrence.date ?? occurrence.occurrenceDate;
    if (!done && input.today !== undefined && effectiveDate > settledThrough(input.today)) continue;
    totals.planned += 1;
    totals.plannedMin += occurrence.durationMin;
    const area = byArea.get(occurrence.areaId);
    if (area) {
      area.planned += 1;
      area.plannedMin += occurrence.durationMin;
    }
    if (done) {
      totals.completed += 1;
      totals.completedMin += occurrence.durationMin;
      if (area) {
        area.completed += 1;
        area.completedMin += occurrence.durationMin;
      }
    }
  }

  const areas = [...byArea.values()]
    .filter((area) => area.planned > 0)
    .map((area) => ({ ...area, adherence: adherenceOf(area.planned, area.completed) }));

  return {
    weekStart: input.weekStart,
    weekEnd: addDays(input.weekStart, 6),
    totals: {
      ...totals,
      skipped,
      adherence: adherenceOf(totals.planned, totals.completed),
      xp: input.xp,
    },
    areas,
  };
}

/** A semana como intervalo de instantes UTC, [início, fim): da meia-noite local de segunda à da segunda seguinte. */
export function weekRangeUtc(weekStart: CivilDate, timezone: string): { from: Date; to: Date } {
  return {
    from: localDateTimeToUtc(weekStart, '00:00', timezone),
    to: localDateTimeToUtc(addDays(weekStart, 7), '00:00', timezone),
  };
}

/** A semana anterior (a segunda-feira 7 dias antes). */
export const previousWeek = (weekStart: CivilDate): CivilDate => addDays(weekStart, -7);

/** Só dá para revisar a semana atual e as passadas: uma semana que ainda não começou não tem o que revisar. */
export function isFutureWeek(weekStart: CivilDate, currentWeekStart: CivilDate): boolean {
  return weekStart > currentWeekStart;
}
