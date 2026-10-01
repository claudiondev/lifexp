import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  calculateXp,
  levelForXp,
  levelProgress,
  type AreaProgress,
  type CivilDate,
  type CompletionResult,
  type UndoResult,
} from '@lifexp/shared';
import { lockAndLoadBlock } from '../blocks/block-lock.js';
import { fromCivil, toBlockTemplate, toExceptionRule } from '../blocks/blocks.mapper.js';
import { occursOn, resolveOccurrence } from '../blocks/domain/week-occurrences.js';
import { CLOCK, type Clock } from '../clock/clock.js';
import type { Completion as CompletionEntity, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  checkCanComplete,
  checkCanUndo,
  completionWindow,
  type CompleteBlockedReason,
  type CompletionWindow,
} from './domain/completion-window.js';
import { toCompletionDto } from './completion.mapper.js';
import { applyXpDelta } from './domain/xp-ledger.js';

const NOT_AN_OCCURRENCE = 'Essa data não é uma ocorrência deste bloco';
const COMPLETE_BLOCKED: Record<CompleteBlockedReason, string> = {
  skipped: 'Esta ocorrência está pulada. Restaure-a antes de concluir',
  not_started: 'Este bloco ainda não começou',
  window_closed: 'O prazo para concluir terminou (vai até 23:59 do dia seguinte)',
};
const UNDO_BLOCKED = 'O prazo para desfazer terminou (vai até 23:59 do dia seguinte)';

type Tx = Prisma.TransactionClient;

@Injectable()
export class CompletionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Conclui uma ocorrência (RF15). Idempotente: concluir de novo devolve a conclusão existente,
   * sem XP novo (RN07). Conclusão + lançamento no livro-caixa + caches saem numa única transação
   * (RN30); a pessoa é travada para duas conclusões simultâneas não perderem XP um do outro.
   */
  async complete(
    userId: string,
    blockId: string,
    occurrenceDate: CivilDate,
  ): Promise<CompletionResult> {
    const now = this.clock.now(); // lido uma vez: o que validamos é o que gravamos
    return this.prisma.$transaction(async (tx) => {
      const timezone = await this.lockUser(tx, userId);
      const { block, resolved } = await this.loadOccurrence(tx, userId, blockId, occurrenceDate);
      const window = this.windowOf(resolved, timezone);

      const existing = await tx.completion.findUnique({
        where: { blockId_occurrenceDate: { blockId, occurrenceDate: fromCivil(occurrenceDate) } },
      });
      if (existing && existing.undoneAt === null) {
        return this.alreadyCompleted(tx, userId, existing);
      }

      const verdict = checkCanComplete({ skipped: resolved.skipped, now, window });
      if (!verdict.ok) throw new ConflictException(COMPLETE_BLOCKED[verdict.reason]);

      const xp = calculateXp({
        durationMin: resolved.durationMin,
        xpWeight: block.activity.xpWeight,
      });
      const snapshot = {
        completedAt: now,
        undoneAt: null,
        activityId: block.activityId,
        areaId: block.activity.areaId,
        durationMin: resolved.durationMin,
        xpAmount: xp,
      };

      // Refazer depois de desfazer reaproveita a mesma linha (a conclusão é única por bloco + data).
      const completion = existing
        ? await tx.completion.update({ where: { id: existing.id }, data: snapshot })
        : await tx.completion.create({
            data: { userId, blockId, occurrenceDate: fromCivil(occurrenceDate), ...snapshot },
          });

      await tx.xpTransaction.create({
        data: {
          userId,
          areaId: block.activity.areaId,
          amount: xp,
          type: 'COMPLETION',
          sourceId: completion.id,
          // O horário do lançamento vem do relógio da aplicação (o mesmo da conclusão), não do
          // relógio do banco: é ele que define em que dia local o XP "caiu".
          createdAt: now,
        },
      });

      const { total, area, change } = await this.applyToCaches(
        tx,
        userId,
        block.activity.areaId,
        xp,
      );
      return {
        completion: toCompletionDto(completion),
        alreadyCompleted: false,
        xpAwarded: xp,
        levelBefore: change.levelBefore,
        levelAfter: change.levelAfter,
        total,
        area,
      };
    });
  }

  /**
   * Desfaz uma conclusão (RF16) só dentro da mesma janela (RN09). Nada é apagado: cria um estorno
   * (lançamento negativo ligado ao original, RN06) e marca a conclusão como desfeita. Idempotente.
   */
  async undo(userId: string, blockId: string, occurrenceDate: CivilDate): Promise<UndoResult> {
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      const timezone = await this.lockUser(tx, userId);
      const { block, resolved } = await this.loadOccurrence(tx, userId, blockId, occurrenceDate);

      const completion = await tx.completion.findUnique({
        where: { blockId_occurrenceDate: { blockId, occurrenceDate: fromCivil(occurrenceDate) } },
      });
      if (!completion || completion.undoneAt !== null) {
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        return { xpReverted: 0, total: levelProgress(user.cachedTotalXp), area: null };
      }

      const verdict = checkCanUndo({ now, window: this.windowOf(resolved, timezone) });
      if (!verdict.ok) throw new ConflictException(UNDO_BLOCKED);

      // O lançamento que esta conclusão gerou e que ainda não foi estornado.
      const original = await tx.xpTransaction.findFirstOrThrow({
        where: { sourceId: completion.id, type: 'COMPLETION', reversal: null },
        orderBy: { createdAt: 'desc' },
      });

      await tx.xpTransaction.create({
        data: {
          userId,
          areaId: original.areaId,
          amount: -original.amount,
          type: 'REVERSAL',
          sourceId: completion.id,
          reversedTransactionId: original.id,
          createdAt: now,
        },
      });
      await tx.completion.update({
        where: { id: completion.id },
        data: { undoneAt: now },
      });

      const { total, area } = await this.applyToCaches(
        tx,
        userId,
        block.activity.areaId,
        -original.amount,
      );
      return { xpReverted: original.amount, total, area };
    });
  }

  /** Trava a linha da pessoa (serializa operações de XP dela) e devolve o fuso horário. */
  private async lockUser(tx: Tx, userId: string): Promise<string> {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true },
    });
    return user.timezone;
  }

  /** O bloco travado e os valores EFETIVOS da ocorrência (com pular/alterar aplicados). */
  private async loadOccurrence(tx: Tx, userId: string, blockId: string, occurrenceDate: CivilDate) {
    const block = await lockAndLoadBlock(tx, userId, blockId);
    const template = toBlockTemplate(block, block.activity.areaId);
    if (!occursOn(template, occurrenceDate)) throw new NotFoundException(NOT_AN_OCCURRENCE);

    const rule = block.exceptions
      .map(toExceptionRule)
      .find((exception) => exception.occurrenceDate === occurrenceDate);
    return { block, resolved: resolveOccurrence(template, rule, occurrenceDate) };
  }

  private windowOf(
    resolved: { date: CivilDate; startTime: string },
    timezone: string,
  ): CompletionWindow {
    return completionWindow(resolved.date, resolved.startTime, timezone);
  }

  /**
   * Atualiza os caches (XP total da pessoa e XP/nível da área) a partir da variação. São derivados
   * do livro-caixa (RN29); a trava da pessoa garante que duas operações não escrevam um nível velho.
   */
  private async applyToCaches(tx: Tx, userId: string, areaId: string, delta: number) {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { cachedTotalXp: true },
    });
    const change = applyXpDelta(user.cachedTotalXp, delta);
    await tx.user.update({ where: { id: userId }, data: { cachedTotalXp: change.after } });

    const current = await tx.areaProgress.findUnique({ where: { areaId } });
    const areaChange = applyXpDelta(current?.cachedXp ?? 0, delta);
    await tx.areaProgress.upsert({
      where: { areaId },
      create: { userId, areaId, cachedXp: areaChange.after, cachedLevel: areaChange.levelAfter },
      update: { cachedXp: areaChange.after, cachedLevel: areaChange.levelAfter },
    });

    const area: AreaProgress = { areaId, ...levelProgress(areaChange.after) };
    return { total: levelProgress(change.after), area, change };
  }

  private async alreadyCompleted(
    tx: Tx,
    userId: string,
    completion: CompletionEntity,
  ): Promise<CompletionResult> {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const progress = await tx.areaProgress.findUnique({ where: { areaId: completion.areaId } });
    const level = levelForXp(user.cachedTotalXp);
    return {
      completion: toCompletionDto(completion),
      alreadyCompleted: true,
      xpAwarded: 0,
      levelBefore: level,
      levelAfter: level,
      total: levelProgress(user.cachedTotalXp),
      area: { areaId: completion.areaId, ...levelProgress(progress?.cachedXp ?? 0) },
    };
  }
}
