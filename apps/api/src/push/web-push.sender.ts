import { Logger } from '@nestjs/common';
import webpush from 'web-push';
import { maskEndpoint } from './log-push.sender.js';
import type { PushOutcome, PushPayload, PushSender, PushTarget } from './push-sender.js';

/** Quanto o serviço de push guarda a mensagem se o aparelho estiver desligado: avisos velhos não valem. */
export const PUSH_TTL_SECONDS = 30 * 60;
/** Tempo máximo esperando o serviço de push responder. */
export const PUSH_TIMEOUT_MS = 10_000;

export interface Vapid {
  subject: string;
  publicKey: string;
  privateKey: string;
}

/**
 * Push de verdade, pelo protocolo Web Push (RFC 8030) com chaves VAPID (RFC 8292). A mensagem é criptografada de ponta
 * a ponta com as chaves do aparelho (RFC 8291): o serviço de push do navegador (Google, Mozilla, Apple) só vê texto
 * cifrado. As chaves VAPID vão em cada chamada (nada global) e nunca para log ou mensagem de erro.
 */
export class WebPushSender implements PushSender {
  readonly enabled = true;
  private readonly logger = new Logger('Push');

  constructor(private readonly vapid: Vapid) {}

  get publicKey(): string {
    return this.vapid.publicKey;
  }

  async send(target: PushTarget, payload: PushPayload): Promise<PushOutcome> {
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: target.keys },
        JSON.stringify(payload),
        {
          TTL: PUSH_TTL_SECONDS,
          urgency: 'normal',
          timeout: PUSH_TIMEOUT_MS,
          vapidDetails: this.vapid,
        },
      );
      return 'sent';
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      // 404 e 410: o navegador cancelou a inscrição (o app foi desinstalado, a permissão revogada).
      if (status === 404 || status === 410) return 'gone';
      this.logger.warn(
        `Falha ao enviar push a ${maskEndpoint(target.endpoint)} (${status ?? 'sem resposta'}): ${
          error instanceof Error ? error.name : 'erro desconhecido'
        }`,
      );
      return 'failed';
    }
  }
}
