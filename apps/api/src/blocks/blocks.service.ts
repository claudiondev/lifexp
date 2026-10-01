import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  addDays,
  endsSameDay,
  weekStartOf,
  type Block,
  type BlockException,
  type CivilDate,
  type CreateBlockInput,
  type PutExceptionInput,
  type UpdateBlockInput,
  type WeekResponse,
} from '@lifexp/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { toCompletionDto } from '../gamification/completion.mapper.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { lockAndLoadBlock } from './block-lock.js';
import { planDelete, planEdit, type NewBlockData } from './domain/series-split.js';
import { computeWeekOccurrences, occursOn } from './domain/week-occurrences.js';
import {
  fromCivil,
  toBlockResponse,
  toBlockTemplate,
  toExceptionResponse,
  toExceptionRule,
} from './blocks.mapper.js';

const ACTIVITY_ARCHIVED = 'A atividade está arquivada. Restaure a atividade e a área primeiro';
const FROM_AFTER_END = 'A série já terminou antes dessa data';
const CROSSES_MIDNIGHT = 'O bloco não pode atravessar a meia-noite';
const NOT_APPLICABLE = 'Esse campo não se aplica ao tipo do bloco';
const NOT_AN_OCCURRENCE = 'Essa data não é uma ocorrência deste bloco';
const SAME_WEEK_ONLY = 'Só é possível mover a ocorrência dentro da mesma semana';

/** Campos de data do plano (texto civil) viram Date UTC para o Prisma. */
function toBlockData(fields: Partial<NewBlockData>): Prisma.BlockUncheckedUpdateInput {
  const { date, validFrom, validUntil, recurrence, ...rest } = fields;
  return {
    ...rest,
    ...(recurrence !== undefined && { recurrence: recurrence === 'weekly' ? 'WEEKLY' : 'ONCE' }),
    ...(date !== undefined && { date: date === null ? null : fromCivil(date) }),
    ...(validFrom !== undefined && { validFrom: validFrom === null ? null : fromCivil(validFrom) }),
    ...(validUntil !== undefined && {
      validUntil: validUntil === null ? null : fromCivil(validUntil),
    }),
  };
}

@Injectable()
export class BlocksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Uma única consulta traz os blocos que podem tocar a semana, com as exceções da semana e a área
   * da atividade (RNF04). As ocorrências são calculadas em memória pela regra de domínio.
   */
  async getWeek(userId: string, weekStart: string): Promise<WeekResponse> {
    const weekEnd = addDays(weekStart, 6);
    const start = fromCivil(weekStart);
    const end = fromCivil(weekEnd);

    const blocks = await this.prisma.block.findMany({
      // 'join' resolve as relações no próprio SELECT (uma ida ao banco), em vez de uma query por relação.
      relationLoadStrategy: 'join',
      where: {
        userId,
        OR: [
          {
            recurrence: 'WEEKLY',
            validFrom: { lte: end },
            OR: [{ validUntil: null }, { validUntil: { gte: start } }],
          },
          { recurrence: 'ONCE', date: { gte: start, lte: end } },
        ],
      },
      include: {
        activity: { select: { areaId: true } },
        exceptions: { where: { occurrenceDate: { gte: start, lte: end } } },
        // Conclusões ativas (não desfeitas) da semana: vêm junto, sem query extra.
        completions: { where: { occurrenceDate: { gte: start, lte: end }, undoneAt: null } },
      },
    });

    const occurrences = computeWeekOccurrences(
      weekStart,
      blocks.map((block) => toBlockTemplate(block, block.activity.areaId)),
      blocks.flatMap((block) => block.exceptions.map(toExceptionRule)),
    );
    return {
      weekStart,
      weekEnd,
      occurrences,
      completions: blocks.flatMap((block) => block.completions.map(toCompletionDto)),
    };
  }

  async create(userId: string, input: CreateBlockInput): Promise<Block> {
    await this.assertActivityUsable(userId, input.activityId);

    const block = await this.prisma.block.create({
      data:
        input.recurrence === 'weekly'
          ? {
              userId,
              activityId: input.activityId,
              recurrence: 'WEEKLY',
              weekday: input.weekday,
              startTime: input.startTime,
              durationMin: input.durationMin,
              validFrom: fromCivil(input.validFrom),
            }
          : {
              userId,
              activityId: input.activityId,
              recurrence: 'ONCE',
              date: fromCivil(input.date),
              startTime: input.startTime,
              durationMin: input.durationMin,
            },
    });
    return toBlockResponse(block);
  }

  /**
   * Edita "a partir de `from`" (esta e as próximas). Com passado, a série atual é encerrada no dia
   * anterior e uma nova começa em `from`; sem passado, o bloco é atualizado no lugar. As
   * ocorrências anteriores a `from` nunca mudam. Devolve o bloco que vale a partir de `from`.
   */
  async update(userId: string, id: string, input: UpdateBlockInput): Promise<Block> {
    const { from, ...changes } = input;

    if (changes.activityId !== undefined) {
      await this.assertActivityUsable(userId, changes.activityId);
    }

    return this.prisma.$transaction(async (tx) => {
      const current = await lockAndLoadBlock(tx, userId, id);
      const plan = planEdit(
        toBlockTemplate(current, current.activity.areaId),
        from,
        changes,
        current.exceptions.map(toExceptionRule),
      );

      if (plan.kind === 'invalid') {
        if (plan.reason === 'FROM_AFTER_END') throw new ConflictException(FROM_AFTER_END);
        if (plan.reason === 'CROSSES_MIDNIGHT') throw new BadRequestException(CROSSES_MIDNIGHT);
        throw new BadRequestException(NOT_APPLICABLE);
      }

      const dropExceptions = (dates: string[]) =>
        dates.length === 0
          ? Promise.resolve()
          : tx.blockException.deleteMany({
              where: { blockId: id, occurrenceDate: { in: dates.map(fromCivil) } },
            });

      if (plan.kind === 'in-place') {
        await dropExceptions(plan.dropExceptions);
        const updated = await tx.block.update({ where: { id }, data: toBlockData(plan.update) });
        return toBlockResponse(updated);
      }

      await tx.block.update({
        where: { id },
        data: { validUntil: fromCivil(plan.closeCurrentAt) },
      });
      const created = await tx.block.create({
        data: { ...(toBlockData(plan.newBlock) as Prisma.BlockUncheckedCreateInput), userId },
      });
      await dropExceptions(plan.dropExceptions);
      if (plan.moveExceptions.length > 0) {
        await tx.blockException.updateMany({
          where: { blockId: id, occurrenceDate: { in: plan.moveExceptions.map(fromCivil) } },
          data: { blockId: created.id },
        });
      }
      return toBlockResponse(created);
    });
  }

  /**
   * Exclui "a partir de `from`". Bloco avulso é removido; série semanal só é encerrada (a linha
   * fica, para preservar o histórico). Excluir de novo, ou depois do fim, não faz nada.
   */
  async remove(userId: string, id: string, from: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await lockAndLoadBlock(tx, userId, id);
      const plan = planDelete(
        toBlockTemplate(current, current.activity.areaId),
        from,
        current.exceptions.map(toExceptionRule),
      );

      if (plan.kind === 'noop') return;
      if (plan.kind === 'delete-row') {
        await tx.block.delete({ where: { id } });
        return;
      }

      await tx.block.update({ where: { id }, data: { validUntil: fromCivil(plan.validUntil) } });
      if (plan.dropExceptions.length > 0) {
        await tx.blockException.deleteMany({
          where: { blockId: id, occurrenceDate: { in: plan.dropExceptions.map(fromCivil) } },
        });
      }
    });
  }

  /**
   * Pula ou altera SÓ aquela ocorrência (RF17, RF49). Idempotente: repetir o PUT com os mesmos
   * dados dá o mesmo resultado, e trocar de "pular" para "alterar" substitui a exceção anterior.
   */
  async putException(
    userId: string,
    blockId: string,
    occurrenceDate: CivilDate,
    input: PutExceptionInput,
  ): Promise<BlockException> {
    return this.prisma.$transaction(async (tx) => {
      // Mesmo bloqueio das edições da série: se a série está sendo dividida, esperamos e
      // validamos contra o estado final.
      const block = await lockAndLoadBlock(tx, userId, blockId);
      const template = toBlockTemplate(block, block.activity.areaId);
      if (!occursOn(template, occurrenceDate)) throw new NotFoundException(NOT_AN_OCCURRENCE);

      if (input.type === 'override') {
        if (
          input.newDate !== undefined &&
          weekStartOf(input.newDate) !== weekStartOf(occurrenceDate)
        ) {
          throw new BadRequestException(SAME_WEEK_ONLY);
        }
        // Valida o resultado final, considerando o que não foi alterado (herdado do bloco).
        const startTime = input.newStartTime ?? block.startTime;
        const durationMin = input.newDurationMin ?? block.durationMin;
        if (!endsSameDay(startTime, durationMin)) throw new BadRequestException(CROSSES_MIDNIGHT);
      }

      const data =
        input.type === 'skip'
          ? { type: 'SKIP' as const, newDate: null, newStartTime: null, newDurationMin: null }
          : {
              type: 'OVERRIDE' as const,
              newDate: input.newDate === undefined ? null : fromCivil(input.newDate),
              newStartTime: input.newStartTime ?? null,
              newDurationMin: input.newDurationMin ?? null,
            };

      const rule = await tx.blockException.upsert({
        where: { blockId_occurrenceDate: { blockId, occurrenceDate: fromCivil(occurrenceDate) } },
        create: { blockId, occurrenceDate: fromCivil(occurrenceDate), ...data },
        update: data,
      });
      return toExceptionResponse(rule);
    });
  }

  /** Restaura a ocorrência original. Idempotente: sem exceção, não há o que restaurar e dá 204. */
  async removeException(userId: string, blockId: string, occurrenceDate: CivilDate): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockAndLoadBlock(tx, userId, blockId);
      await tx.blockException.deleteMany({
        where: { blockId, occurrenceDate: fromCivil(occurrenceDate) },
      });
    });
  }

  /**
   * A atividade precisa ser da pessoa (404 se não for, sem revelar que existe: RS06) e estar
   * ativa, junto com a área dela. Blocos já existentes de atividades arquivadas continuam visíveis.
   */
  private async assertActivityUsable(userId: string, activityId: string): Promise<void> {
    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, userId },
      select: { archivedAt: true, area: { select: { archivedAt: true } } },
    });
    if (!activity) throw new NotFoundException('Atividade não encontrada');
    if (activity.archivedAt !== null || activity.area.archivedAt !== null) {
      throw new ConflictException(ACTIVITY_ARCHIVED);
    }
  }
}
