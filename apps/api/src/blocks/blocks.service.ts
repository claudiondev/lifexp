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
import {
  planDelete,
  planEdit,
  type CompletionRef,
  type NewBlockData,
} from './domain/series-split.js';
import { computeWeekOccurrences, occursOn } from './domain/week-occurrences.js';
import {
  fromCivil,
  toBlockResponse,
  toBlockTemplate,
  toCivil,
  toExceptionResponse,
  toExceptionRule,
} from './blocks.mapper.js';

const GOAL_CLOSED = 'A meta está concluída ou abandonada. Reabra a meta para vincular blocos';
const ACTIVITY_ARCHIVED = 'A atividade está arquivada. Restaure a atividade e a área primeiro';
const FROM_AFTER_END = 'A série já terminou antes dessa data';
const CROSSES_MIDNIGHT = 'O bloco não pode atravessar a meia-noite';
const NOT_APPLICABLE = 'Esse campo não se aplica ao tipo do bloco';
const NOT_AN_OCCURRENCE = 'Essa data não é uma ocorrência deste bloco';
const SAME_WEEK_ONLY = 'Só é possível mover a ocorrência dentro da mesma semana';
const COMPLETED_LOCK =
  'Esta ocorrência já foi concluída. Desfaça a conclusão antes de pular ou alterar';
const COMPLETIONS_ON_WEEKDAY_CHANGE =
  'Há ocorrências concluídas a partir dessa data. Desfaça as conclusões antes de mudar o dia da semana';
const COMPLETION_ON_DATE_CHANGE =
  'Este bloco já foi concluído. Desfaça a conclusão antes de mudar a data';
const ACTIVE_COMPLETIONS_ON_DELETE =
  'Há ocorrências concluídas a partir dessa data. Desfaça as conclusões antes de excluir';

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

    // A meta fica travada (FOR KEY SHARE) até o bloco ser gravado: excluir a meta no meio não deixa
    // o vínculo apontar para uma meta que sumiu (violação de chave estrangeira, erro 500).
    const block = await this.prisma.$transaction(async (tx) => {
      if (input.goalId) await this.lockGoalForLink(tx, userId, input.goalId);
      return tx.block.create({
        data:
          input.recurrence === 'weekly'
            ? {
                userId,
                activityId: input.activityId,
                goalId: input.goalId ?? null,
                recurrence: 'WEEKLY',
                weekday: input.weekday,
                startTime: input.startTime,
                durationMin: input.durationMin,
                validFrom: fromCivil(input.validFrom),
              }
            : {
                userId,
                activityId: input.activityId,
                goalId: input.goalId ?? null,
                recurrence: 'ONCE',
                date: fromCivil(input.date),
                startTime: input.startTime,
                durationMin: input.durationMin,
              },
      });
    });
    return toBlockResponse(block);
  }

  /**
   * Conclusões do bloco que importam para uma edição/exclusão a partir de `from`: numa série semanal
   * só as de `from` em diante; num bloco avulso, todas (ele só tem uma ocorrência).
   */
  private async loadCompletionRefs(
    tx: Prisma.TransactionClient,
    blockId: string,
    recurrence: 'weekly' | 'once',
    from: string,
  ): Promise<CompletionRef[]> {
    const rows = await tx.completion.findMany({
      where: {
        blockId,
        ...(recurrence === 'weekly' && { occurrenceDate: { gte: fromCivil(from) } }),
      },
      select: { occurrenceDate: true, undoneAt: true },
    });
    return rows.map((row) => ({
      occurrenceDate: toCivil(row.occurrenceDate),
      active: row.undoneAt === null,
    }));
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
      // Mesma trava do create: a meta não some no meio da gravação do vínculo.
      if (changes.goalId && changes.goalId !== current.goalId) {
        await this.lockGoalForLink(tx, userId, changes.goalId);
      }
      const template = toBlockTemplate(current, current.activity.areaId);
      const plan = planEdit(
        template,
        from,
        changes,
        current.exceptions.map(toExceptionRule),
        await this.loadCompletionRefs(tx, id, template.recurrence, from),
      );

      if (plan.kind === 'invalid') {
        if (plan.reason === 'FROM_AFTER_END') throw new ConflictException(FROM_AFTER_END);
        if (plan.reason === 'COMPLETIONS_ON_CHANGED_WEEKDAY') {
          throw new ConflictException(COMPLETIONS_ON_WEEKDAY_CHANGE);
        }
        if (plan.reason === 'COMPLETION_ON_CHANGED_DATE') {
          throw new ConflictException(COMPLETION_ON_DATE_CHANGE);
        }
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
      if (plan.moveCompletions.length > 0) {
        // As conclusões acompanham a série nova: a ocorrência é a mesma, só mudou o id do bloco.
        await tx.completion.updateMany({
          where: { blockId: id, occurrenceDate: { in: plan.moveCompletions.map(fromCivil) } },
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
      const template = toBlockTemplate(current, current.activity.areaId);
      const plan = planDelete(
        template,
        from,
        current.exceptions.map(toExceptionRule),
        await this.loadCompletionRefs(tx, id, template.recurrence, from),
      );

      if (plan.kind === 'noop') return;
      if (plan.kind === 'invalid') throw new ConflictException(ACTIVE_COMPLETIONS_ON_DELETE);
      if (plan.kind === 'delete-row') {
        // Só sobraram conclusões desfeitas (o plano recusa as ativas). O banco não deixa apagar um
        // bloco que ainda tem conclusões, então elas saem antes; o livro-caixa não é tocado.
        await tx.completion.deleteMany({ where: { blockId: id } });
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
      await this.assertNotCompleted(tx, blockId, occurrenceDate);

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
      const existing = await tx.blockException.findUnique({
        where: { blockId_occurrenceDate: { blockId, occurrenceDate: fromCivil(occurrenceDate) } },
      });
      // Restaurar uma ocorrência alterada e já concluída mudaria o que foi concluído.
      if (existing) await this.assertNotCompleted(tx, blockId, occurrenceDate);
      await tx.blockException.deleteMany({
        where: { blockId, occurrenceDate: fromCivil(occurrenceDate) },
      });
    });
  }

  /** Uma ocorrência já concluída fica travada: para mudar, desfaça a conclusão antes. */
  private async assertNotCompleted(
    tx: Prisma.TransactionClient,
    blockId: string,
    occurrenceDate: CivilDate,
  ): Promise<void> {
    const active = await tx.completion.findFirst({
      where: { blockId, occurrenceDate: fromCivil(occurrenceDate), undoneAt: null },
      select: { id: true },
    });
    if (active) throw new ConflictException(COMPLETED_LOCK);
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

  /**
   * Trava a meta contra exclusão (FOR KEY SHARE) enquanto o vínculo é gravado. A meta precisa ser da
   * pessoa (404 se não for) e estar em andamento: ativa ou pausada.
   */
  private async lockGoalForLink(
    tx: Prisma.TransactionClient,
    userId: string,
    goalId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<{ status: string }[]>`
      SELECT "status"::text AS "status" FROM "Goal"
      WHERE "id" = ${goalId} AND "userId" = ${userId} FOR KEY SHARE`;
    const goal = rows[0];
    if (!goal) throw new NotFoundException('Meta não encontrada');
    if (goal.status === 'COMPLETED' || goal.status === 'ABANDONED') {
      throw new ConflictException(GOAL_CLOSED);
    }
  }
}
