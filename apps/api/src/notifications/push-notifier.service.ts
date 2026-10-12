import { Inject, Injectable, Logger } from '@nestjs/common';
import type { CivilDate } from '@lifexp/shared';
import { toCivil } from '../blocks/blocks.mapper.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PUSH_SENDER, type PushSender } from '../push/push-sender.js';
import {
  actionTokenExpiry,
  generateActionToken,
  hashActionToken,
} from './domain/push-action-token.js';
import { toPushPayload } from './domain/push-payload.js';

/** Tentativas por aviso: uma falha do serviço de push é repetida no minuto seguinte, até este limite. */
export const MAX_PUSH_ATTEMPTS = 3;
/** Aviso de mais de meia hora atrás já não serve (um lembrete "em 15 min" que chega tarde confunde). */
export const PUSH_FRESH_MIN = 30;
const BATCH = 100;

export interface PushSummary {
  sent: number;
  failed: number;
  removed: number;
}

@Injectable()
export class PushNotifier {
  private readonly logger = new Logger(PushNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_SENDER) private readonly sender: PushSender,
  ) {}

  /**
   * Manda por push (RF41) os avisos já gerados e ainda não enviados de quem ligou o push e tem aparelho inscrito.
   *
   * Como no e-mail: quem chama garante uma instância por vez (a varredura roda sob trava de banco) e a tentativa é
   * contada ANTES de enviar, então uma queda no meio perde a tentativa em vez de virar aviso repetido em loop. O
   * envio é "ao menos uma vez". Aviso já lido no app, ainda no futuro ou velho demais fica de fora. Inscrição que o
   * navegador cancelou (404/410) é apagada; falha passageira é repetida. Sem chaves VAPID, não faz nada.
   */
  async sendPending(now: Date): Promise<PushSummary> {
    const summary: PushSummary = { sent: 0, failed: 0, removed: 0 };
    if (!this.sender.enabled) return summary;

    const cutoff = new Date(now.getTime() - PUSH_FRESH_MIN * 60_000);
    const pending = await this.prisma.notification.findMany({
      where: {
        pushSentAt: null,
        pushAttempts: { lt: MAX_PUSH_ATTEMPTS },
        readAt: null,
        scheduledFor: { gte: cutoff, lte: now },
        user: {
          notificationPreference: { pushEnabled: true },
          pushSubscriptions: { some: {} },
        },
      },
      include: { user: { select: { pushSubscriptions: true, timezone: true } } },
      orderBy: { id: 'asc' },
      take: BATCH,
    });

    for (const notification of pending) {
      const claimed = await this.prisma.notification.updateMany({
        where: { id: notification.id },
        data: { pushAttempts: { increment: 1 } },
      });
      // A conta pode ter sido excluída entre a leitura e agora (RS15): não há mais para quem avisar.
      if (claimed.count === 0) continue;

      const occurrenceDate = notification.occurrenceDate
        ? toCivil(notification.occurrenceDate)
        : null;
      const actionToken =
        notification.kind === 'CHECKIN' && occurrenceDate
          ? await this.actionTokenFor(
              notification.id,
              occurrenceDate,
              notification.user.timezone,
              now,
            )
          : undefined;
      const payload = toPushPayload(
        {
          kind: notification.kind,
          title: notification.title,
          body: notification.body,
          dedupeKey: notification.dedupeKey,
          occurrenceDate,
        },
        actionToken,
      );
      let delivered = false;
      const gone: string[] = [];
      for (const subscription of notification.user.pushSubscriptions) {
        const outcome = await this.sender.send(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
        );
        if (outcome === 'sent') delivered = true;
        if (outcome === 'gone') gone.push(subscription.id);
      }

      if (gone.length > 0) {
        const { count } = await this.prisma.pushSubscription.deleteMany({
          where: { id: { in: gone } },
        });
        summary.removed += count;
      }
      if (delivered) {
        await this.prisma.notification.updateMany({
          where: { id: notification.id },
          data: { pushSentAt: now },
        });
        summary.sent += 1;
      } else {
        summary.failed += 1;
        this.logger.warn(
          `Push do aviso ${notification.id} não saiu (tentativa ${notification.pushAttempts + 1} de ${MAX_PUSH_ATTEMPTS})`,
        );
      }
    }
    return summary;
  }

  /**
   * Gera (ou renova) o token de ação do check-in (RF41): o valor em claro só existe aqui, pouco
   * antes de ir para o payload; no banco fica só o hash. Reenviar o mesmo aviso troca o token
   * anterior por um novo, com a mesma expiração recalculada.
   */
  private async actionTokenFor(
    notificationId: string,
    occurrenceDate: CivilDate,
    timezone: string,
    now: Date,
  ): Promise<string> {
    const token = generateActionToken();
    const tokenHash = hashActionToken(token);
    const expiresAt = actionTokenExpiry(occurrenceDate, timezone);
    // createdAt vem do Clock, não do banco (como no XpTransaction): a CHECK de validade compara
    // contra este instante, e o relógio de teste não bate com o "agora" real do Postgres.
    await this.prisma.pushActionToken.upsert({
      where: { notificationId },
      create: { notificationId, tokenHash, expiresAt, createdAt: now },
      update: { tokenHash, expiresAt, createdAt: now },
    });
    return token;
  }
}
