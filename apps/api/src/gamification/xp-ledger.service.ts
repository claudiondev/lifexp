import { Injectable } from '@nestjs/common';
import { levelProgress, type AreaProgress, type LevelProgressDto } from '@lifexp/shared';
import type { Prisma, XpTransaction, XpTransactionType } from '../generated/prisma/client.js';
import { applyXpDelta, type XpChange } from './domain/xp-ledger.js';

export type Tx = Prisma.TransactionClient;

export interface Credit {
  userId: string;
  /** Área que recebe o XP; nulo conta só no total (ex.: meta sem área). */
  areaId: string | null;
  amount: number;
  type: Exclude<XpTransactionType, 'REVERSAL'>;
  /** Id da origem: Completion, Milestone ou Goal, conforme o tipo. */
  sourceId: string;
  /** O instante vem do relógio da aplicação: define em que dia local o XP "caiu". */
  createdAt: Date;
}

export interface LedgerResult {
  total: LevelProgressDto;
  area: AreaProgress | null;
  change: XpChange;
}

/**
 * Único lugar que escreve no livro-caixa de XP (RN29) e mantém os caches (XP total e por área) na
 * mesma transação. Conclusão de bloco, marco e meta passam todos por aqui.
 */
@Injectable()
export class XpLedgerService {
  /**
   * Trava a linha da pessoa (serializa as operações de XP dela) e devolve o fuso horário.
   *
   * É FOR NO KEY UPDATE de propósito: serializa as operações de XP entre si, mas NÃO conflita com o
   * FOR KEY SHARE que o banco toma na pessoa ao criar um bloco ou uma meta (chave estrangeira).
   * Com FOR UPDATE, uma conclusão (trava pessoa e depois bloco) e uma edição (trava bloco e depois
   * a chave da pessoa) ficavam esperando uma pela outra: deadlock e erro 500.
   */
  async lockUser(tx: Tx, userId: string): Promise<string> {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR NO KEY UPDATE`;
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true },
    });
    return user.timezone;
  }

  async credit(tx: Tx, credit: Credit): Promise<LedgerResult> {
    await tx.xpTransaction.create({
      data: {
        userId: credit.userId,
        areaId: credit.areaId,
        amount: credit.amount,
        type: credit.type,
        sourceId: credit.sourceId,
        createdAt: credit.createdAt,
      },
    });
    return this.applyToCaches(tx, credit.userId, credit.areaId, credit.amount);
  }

  /** O lançamento de uma origem que ainda não foi estornado, ou nulo. */
  async findActiveEntry(
    tx: Tx,
    sourceId: string,
    type: Exclude<XpTransactionType, 'REVERSAL'>,
  ): Promise<XpTransaction | null> {
    return tx.xpTransaction.findFirst({
      where: { sourceId, type, reversal: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Estorna um lançamento (RN06): nada é apagado, entra um lançamento negativo ligado ao original. */
  async reverse(tx: Tx, original: XpTransaction, createdAt: Date): Promise<LedgerResult> {
    await tx.xpTransaction.create({
      data: {
        userId: original.userId,
        areaId: original.areaId,
        amount: -original.amount,
        type: 'REVERSAL',
        sourceId: original.sourceId,
        reversedTransactionId: original.id,
        createdAt,
      },
    });
    return this.applyToCaches(tx, original.userId, original.areaId, -original.amount);
  }

  /**
   * Atualiza os caches a partir da variação. São derivados do livro-caixa (RN29); a trava da pessoa
   * garante que duas operações não escrevam um nível velho.
   */
  async applyToCaches(
    tx: Tx,
    userId: string,
    areaId: string | null,
    delta: number,
  ): Promise<LedgerResult> {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { cachedTotalXp: true },
    });
    const change = applyXpDelta(user.cachedTotalXp, delta);
    await tx.user.update({ where: { id: userId }, data: { cachedTotalXp: change.after } });
    const total = levelProgress(change.after);
    if (areaId === null) return { total, area: null, change };

    const current = await tx.areaProgress.findUnique({ where: { areaId } });
    const areaChange = applyXpDelta(current?.cachedXp ?? 0, delta);
    await tx.areaProgress.upsert({
      where: { areaId },
      create: { userId, areaId, cachedXp: areaChange.after, cachedLevel: areaChange.levelAfter },
      update: { cachedXp: areaChange.after, cachedLevel: areaChange.levelAfter },
    });
    return { total, area: { areaId, ...levelProgress(areaChange.after) }, change };
  }
}
