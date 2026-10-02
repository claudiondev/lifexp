import { Injectable } from '@nestjs/common';
import { addDays, weekStartOf, type CivilDate, type Occurrence } from '@lifexp/shared';
import { toBlockTemplate, toCivil, toExceptionRule } from '../blocks/blocks.mapper.js';
import { computeWeekOccurrences } from '../blocks/domain/week-occurrences.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface OccurrenceHistory {
  occurrences: Occurrence[];
  /** `blockId|occurrenceDate` das conclusões ativas (a identidade da ocorrência, RN32). */
  completedKeys: Set<string>;
}

const isDate = (value: CivilDate | null): value is CivilDate => value !== null;

/**
 * As ocorrências de uma pessoa, semana a semana, até hoje, com o que foi concluído. Base do streak e do
 * radar de equilíbrio: eles dependem do histórico e do tempo (não de um cache), então são recalculados.
 */
@Injectable()
export class OccurrenceHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** `since` limita o início (as semanas anteriores a ele não são calculadas); sem ele, vai do 1º bloco. */
  async load(userId: string, today: CivilDate, since?: CivilDate): Promise<OccurrenceHistory> {
    const blocks = await this.prisma.block.findMany({
      where: { userId },
      include: {
        activity: { select: { areaId: true } },
        exceptions: true,
        completions: { where: { undoneAt: null }, select: { occurrenceDate: true } },
      },
    });
    const templates = blocks.map((block) => toBlockTemplate(block, block.activity.areaId));
    const exceptions = blocks.flatMap((block) => block.exceptions.map(toExceptionRule));
    const completedKeys = new Set(
      blocks.flatMap((block) =>
        block.completions.map((completion) => `${block.id}|${toCivil(completion.occurrenceDate)}`),
      ),
    );

    const first = templates
      .map((block) => block.validFrom ?? block.date)
      .filter(isDate)
      .sort()[0];
    if (!first) return { occurrences: [], completedKeys };

    const from = since && since > first ? since : first;
    const occurrences: Occurrence[] = [];
    for (let week = weekStartOf(from); week <= today; week = addDays(week, 7)) {
      occurrences.push(...computeWeekOccurrences(week, templates, exceptions));
    }
    return { occurrences, completedKeys };
  }
}
