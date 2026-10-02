import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { PushConfig, PushStatus, PushSubscriptionInput } from '@lifexp/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { PUSH_SENDER, type PushPayload, type PushSender } from './push-sender.js';

/** Aparelhos por pessoa: celular, tablet, computador... sem virar um depósito de inscrições velhas. */
export const MAX_PUSH_DEVICES = 10;

const DISABLED = 'O push não está configurado neste servidor';
const NO_DEVICE = 'Nenhum aparelho inscrito: ative o push em Configurações primeiro';
const LIMIT = `Você já tem ${MAX_PUSH_DEVICES} aparelhos inscritos. Desative algum para adicionar outro`;

export const TEST_PAYLOAD: PushPayload = {
  title: 'LifeXP',
  body: 'Teste: seus avisos vão chegar por aqui.',
  url: '/',
  tag: 'test',
};

@Injectable()
export class PushSubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_SENDER) private readonly sender: PushSender,
  ) {}

  config(): PushConfig {
    return { enabled: this.sender.enabled, publicKey: this.sender.publicKey };
  }

  async status(userId: string): Promise<PushStatus> {
    return { devices: await this.prisma.pushSubscription.count({ where: { userId } }) };
  }

  /**
   * Inscreve o aparelho (RF41). O endereço é único: o mesmo aparelho que entra em outra conta passa a pertencer a ela
   * (e as chaves novas valem). Repetir a inscrição é seguro. O limite de aparelhos vale mesmo com pedidos simultâneos.
   */
  async subscribe(userId: string, input: PushSubscriptionInput): Promise<PushStatus> {
    if (!this.sender.enabled) throw new ConflictException(DISABLED);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR NO KEY UPDATE`;
      const keys = { p256dh: input.keys.p256dh, auth: input.keys.auth };
      const existing = await tx.pushSubscription.findUnique({
        where: { endpoint: input.endpoint },
      });
      if (existing) {
        await tx.pushSubscription.update({ where: { id: existing.id }, data: { userId, ...keys } });
        return;
      }
      if ((await tx.pushSubscription.count({ where: { userId } })) >= MAX_PUSH_DEVICES) {
        throw new ConflictException(LIMIT);
      }
      await tx.pushSubscription.create({ data: { userId, endpoint: input.endpoint, ...keys } });
    });
    return this.status(userId);
  }

  /** Cancela a inscrição do aparelho. Idempotente: já cancelada (ou de outra pessoa) não é erro nem vaza nada. */
  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  /** Envia um aviso de teste a todos os aparelhos da pessoa e limpa as inscrições que o navegador já cancelou. */
  async sendTest(userId: string): Promise<{ sent: number }> {
    if (!this.sender.enabled) throw new ConflictException(DISABLED);
    const subscriptions = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (subscriptions.length === 0) throw new ConflictException(NO_DEVICE);

    let sent = 0;
    const gone: string[] = [];
    for (const subscription of subscriptions) {
      const outcome = await this.sender.send(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        TEST_PAYLOAD,
      );
      if (outcome === 'sent') sent += 1;
      if (outcome === 'gone') gone.push(subscription.id);
    }
    if (gone.length > 0) {
      await this.prisma.pushSubscription.deleteMany({ where: { id: { in: gone }, userId } });
    }
    return { sent };
  }
}
