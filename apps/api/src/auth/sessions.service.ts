import { Injectable, NotFoundException } from '@nestjs/common';
import type { SessionInfo } from '@lifexp/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { describeDevice } from './domain/device-label.js';

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sessões (aparelhos) ativas da pessoa, a atual primeiro e depois as mais recentes (RF48).
   * Uma sessão é uma família de refresh tokens: cada renovação troca o token, mas a família fica.
   */
  async list(userId: string, currentSessionId: string, now: Date): Promise<SessionInfo[]> {
    const active = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      select: { tokenFamily: true, userAgent: true, lastUsedAt: true },
    });
    // No máximo um token ativo por família; se houver mais, vale o mais recente (a lista vem ordenada).
    const latest = new Map<string, (typeof active)[number]>();
    for (const row of active) if (!latest.has(row.tokenFamily)) latest.set(row.tokenFamily, row);

    // "Entrou em": o primeiro token da família, mesmo que já tenha sido trocado várias vezes.
    const firsts = await this.prisma.session.groupBy({
      by: ['tokenFamily'],
      where: { userId, tokenFamily: { in: [...latest.keys()] } },
      _min: { createdAt: true },
    });
    const startedAt = new Map(firsts.map((row) => [row.tokenFamily, row._min.createdAt]));

    return [...latest.values()]
      .map((row) => ({
        id: row.tokenFamily,
        device: describeDevice(row.userAgent),
        createdAt: (startedAt.get(row.tokenFamily) ?? row.lastUsedAt).toISOString(),
        lastUsedAt: row.lastUsedAt.toISOString(),
        current: row.tokenFamily === currentSessionId,
      }))
      .sort(
        (a, b) => Number(b.current) - Number(a.current) || b.lastUsedAt.localeCompare(a.lastUsedAt),
      );
  }

  /**
   * Encerra uma sessão. Idempotente para as próprias (repetir não é erro); sessão de outra pessoa ou
   * inexistente responde 404, igual (RS06).
   */
  async revoke(userId: string, sessionId: string, now: Date): Promise<void> {
    const owned = await this.prisma.session.count({ where: { userId, tokenFamily: sessionId } });
    if (owned === 0) throw new NotFoundException('Sessão não encontrada');
    await this.prisma.session.updateMany({
      where: { userId, tokenFamily: sessionId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  /** Encerra todas as sessões menos a atual e devolve quantos aparelhos foram desconectados. */
  async revokeOthers(userId: string, currentSessionId: string, now: Date): Promise<number> {
    const others = await this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
        tokenFamily: { not: currentSessionId },
      },
      distinct: ['tokenFamily'],
      select: { tokenFamily: true },
    });
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, tokenFamily: { not: currentSessionId } },
      data: { revokedAt: now },
    });
    return others.length;
  }
}
