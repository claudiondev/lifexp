import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PushActionInput, PushActionResult } from '@lifexp/shared';
import { BlocksService } from '../blocks/blocks.service.js';
import { toCivil } from '../blocks/blocks.mapper.js';
import { CompletionsService } from '../gamification/completions.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CLOCK, type Clock } from '../clock/clock.js';
import { checkinResultText, hashActionToken } from './domain/push-action-token.js';

const INVALID_TOKEN = 'Link inválido ou expirado';
const FALLBACK_ACTIVITY_NAME = 'Bloco';

@Injectable()
export class PushActionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly completions: CompletionsService,
    private readonly blocks: BlocksService,
  ) {}

  /**
   * "Cumpri" ou "Pulei" pelo botão da notificação (RF41), sem sessão: o token (vindo do push,
   * cifrado de ponta a ponta) é a única credencial. Token alheio, inexistente ou vencido responde
   * 404, igual a um link morto. As ações passam pelos mesmos serviços do app (`CompletionsService`,
   * `BlocksService`), então XP, quest, conquistas e as travas de concorrência são as mesmas.
   */
  async act(token: string, action: PushActionInput): Promise<PushActionResult> {
    const now = this.clock.now();
    const tokenHash = hashActionToken(token);
    const found = await this.prisma.pushActionToken.findUnique({
      where: { tokenHash },
      include: { notification: true },
    });
    const { notification } = found ?? {};
    if (
      !found ||
      found.expiresAt.getTime() < now.getTime() ||
      !notification ||
      notification.kind !== 'CHECKIN' ||
      !notification.blockId ||
      !notification.occurrenceDate
    ) {
      throw new NotFoundException(INVALID_TOKEN);
    }

    const { userId, blockId } = notification;
    const occurrenceDate = toCivil(notification.occurrenceDate);
    const activityName = await this.activityNameOf(blockId);

    if (action === 'skip') {
      await this.blocks.putException(userId, blockId, occurrenceDate, { type: 'skip' });
      return checkinResultText({
        action,
        activityName,
        xpAwarded: 0,
        leveledUp: false,
        newLevel: 0,
      });
    }

    const result = await this.completions.complete(userId, blockId, occurrenceDate);
    return checkinResultText({
      action,
      activityName,
      xpAwarded: result.xpAwarded,
      leveledUp: result.levelAfter > result.levelBefore,
      newLevel: result.levelAfter,
    });
  }

  private async activityNameOf(blockId: string): Promise<string> {
    const block = await this.prisma.block.findUnique({
      where: { id: blockId },
      select: { activity: { select: { name: true } } },
    });
    return block?.activity.name ?? FALLBACK_ACTIVITY_NAME;
  }
}
