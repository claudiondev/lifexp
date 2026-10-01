import { Injectable } from '@nestjs/common';
import { levelForXp } from '@lifexp/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { sumLedger } from './domain/xp-ledger.js';

export interface CacheDiscrepancy {
  scope: 'user' | 'area';
  areaId?: string;
  /** Valor que está no cache. */
  cached: number;
  /** Valor que o livro-caixa diz que deveria ser. */
  expected: number;
}

export interface RebuildReport {
  /** Quantos caches estavam errados (e foram corrigidos). */
  discrepancies: CacheDiscrepancy[];
}

/**
 * O livro-caixa (XpTransaction) é a fonte da verdade do XP (RN29); o XP total da pessoa e o
 * XP/nível por área são caches derivados dele. Este serviço verifica e, se preciso, reconstrói
 * esses caches: serve de rede de segurança para qualquer inconsistência (bug, script, migração).
 */
@Injectable()
export class CacheRebuildService {
  constructor(private readonly prisma: PrismaService) {}

  /** Só compara (não altera nada): o que o cache diz versus o que o livro-caixa soma. */
  async check(userId: string): Promise<CacheDiscrepancy[]> {
    const [user, ledger, progress] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { cachedTotalXp: true },
      }),
      this.prisma.xpTransaction.findMany({
        where: { userId },
        select: { areaId: true, amount: true },
      }),
      this.prisma.areaProgress.findMany({ where: { userId } }),
    ]);
    return this.compare(user.cachedTotalXp, ledger, progress);
  }

  /**
   * Recalcula os caches da pessoa somando o livro-caixa e corrige o que estiver diferente.
   * Idempotente: rodar de novo, sem mudanças no livro, não altera nada.
   */
  async rebuild(userId: string): Promise<RebuildReport> {
    return this.prisma.$transaction(async (tx) => {
      // Mesma trava das conclusões: ninguém grava XP enquanto reconstruímos.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;

      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const ledger = await tx.xpTransaction.findMany({
        where: { userId },
        select: { areaId: true, amount: true },
      });
      const progress = await tx.areaProgress.findMany({ where: { userId } });

      const discrepancies = this.compare(user.cachedTotalXp, ledger, progress);
      const { total, byArea } = sumLedger(ledger);

      await tx.user.update({ where: { id: userId }, data: { cachedTotalXp: total } });
      for (const [areaId, xp] of byArea) {
        await tx.areaProgress.upsert({
          where: { areaId },
          create: { userId, areaId, cachedXp: xp, cachedLevel: levelForXp(xp) },
          update: { cachedXp: xp, cachedLevel: levelForXp(xp) },
        });
      }
      // Áreas com cache mas sem nenhum lançamento: voltam para 0 XP e nível 1.
      for (const row of progress.filter((candidate) => !byArea.has(candidate.areaId))) {
        await tx.areaProgress.update({
          where: { areaId: row.areaId },
          data: { cachedXp: 0, cachedLevel: 1 },
        });
      }
      return { discrepancies };
    });
  }

  private compare(
    cachedTotal: number,
    ledger: readonly { areaId: string | null; amount: number }[],
    progress: readonly { areaId: string; cachedXp: number; cachedLevel: number }[],
  ): CacheDiscrepancy[] {
    const { total, byArea } = sumLedger(ledger);
    const found: CacheDiscrepancy[] = [];
    if (cachedTotal !== total) found.push({ scope: 'user', cached: cachedTotal, expected: total });

    const cachedByArea = new Map(progress.map((row) => [row.areaId, row]));
    for (const [areaId, expected] of byArea) {
      const row = cachedByArea.get(areaId);
      if (!row || row.cachedXp !== expected || row.cachedLevel !== levelForXp(expected)) {
        found.push({ scope: 'area', areaId, cached: row?.cachedXp ?? 0, expected });
      }
    }
    for (const row of progress) {
      if (byArea.has(row.areaId)) continue;
      if (row.cachedXp !== 0 || row.cachedLevel !== 1) {
        found.push({ scope: 'area', areaId: row.areaId, cached: row.cachedXp, expected: 0 });
      }
    }
    return found;
  }
}
