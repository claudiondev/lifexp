import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  calculateXp,
  levelForXp,
  levelProgress,
  type CivilDate,
  type CompletionResult,
  type UndoResult,
} from '@lifexp/shared';
import { lockAndLoadBlock } from '../blocks/block-lock.js';
import { fromCivil, toBlockTemplate, toExceptionRule } from '../blocks/blocks.mapper.js';
import { occursOn, resolveOccurrence } from '../blocks/domain/week-occurrences.js';
import { CLOCK, type Clock } from '../clock/clock.js';
import type { Completion as CompletionEntity } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { XpLedgerService, type Tx } from './xp-ledger.service.js';
import {
  checkCanComplete,
  checkCanUndo,
  completionWindow,
  type CompleteBlockedReason,
  type CompletionWindow,
} from './domain/completion-window.js';
import { toCompletionDto } from './completion.mapper.js';

const NOT_AN_OCCURRENCE = 'Essa data não é uma ocorrência deste bloco';
const COMPLETE_BLOCKED: Record<CompleteBlockedReason, string> = {
  skipped: 'Esta ocorrência está pulada. Restaure-a antes de concluir',
  not_started: 'Este bloco ainda não começou',
  window_closed: 'O prazo para concluir terminou (vai até 23:59 do dia seguinte)',
};
const UNDO_BLOCKED = 'O prazo para desfazer terminou (vai até 23:59 do dia seguinte)';

@Injectable()
export class CompletionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ledger: XpLedgerService,
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
      const timezone = await this.ledger.lockUser(tx, userId);
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

      const { total, area, change } = await this.ledger.credit(tx, {
        userId,
        areaId: block.activity.areaId,
        amount: xp,
        type: 'COMPLETION',
        sourceId: completion.id,
        createdAt: now,
      });
      return {
        completion: toCompletionDto(completion),
        alreadyCompleted: false,
        xpAwarded: xp,
        levelBefore: change.levelBefore,
        levelAfter: change.levelAfter,
        total,
        area: area!,
        questBonusXp: 0,
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
      const timezone = await this.ledger.lockUser(tx, userId);
      const { resolved } = await this.loadOccurrence(tx, userId, blockId, occurrenceDate);

      const completion = await tx.completion.findUnique({
        where: { blockId_occurrenceDate: { blockId, occurrenceDate: fromCivil(occurrenceDate) } },
      });
      if (!completion || completion.undoneAt !== null) {
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        return {
          xpReverted: 0,
          total: levelProgress(user.cachedTotalXp),
          area: null,
          questBonusReverted: 0,
        };
      }

      const verdict = checkCanUndo({ now, window: this.windowOf(resolved, timezone) });
      if (!verdict.ok) throw new ConflictException(UNDO_BLOCKED);

      // O lançamento que esta conclusão gerou e que ainda não foi estornado.
      const original = await tx.xpTransaction.findFirstOrThrow({
        where: { sourceId: completion.id, type: 'COMPLETION', reversal: null },
        orderBy: { createdAt: 'desc' },
      });

      await tx.completion.update({
        where: { id: completion.id },
        data: { undoneAt: now },
      });

      // A área vem do lançamento original (que veio da foto da conclusão), NÃO da atividade de hoje:
      // se a série foi editada para outra atividade/área depois de concluir, o XP volta de onde saiu.
      const { total, area } = await this.ledger.reverse(tx, original, now);
      return { xpReverted: original.amount, total, area, questBonusReverted: 0 };
    });
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
      questBonusXp: 0,
    };
  }
}
