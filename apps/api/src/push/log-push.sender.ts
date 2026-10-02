import { Logger } from '@nestjs/common';
import type { PushOutcome, PushPayload, PushSender, PushTarget } from './push-sender.js';

/** O host do endereço, sem caminho nem token: o caminho identifica o aparelho e é segredo (RS14). */
export function maskEndpoint(endpoint: string): string {
  return /^https:\/\/([^/?#:]+)/i.exec(endpoint)?.[1]?.toLowerCase() ?? 'endereço inválido';
}

/**
 * Push desligado: sem chaves VAPID o servidor não envia nada. Existe para a aplicação subir sem configuração (dev e
 * testes) e dizer com clareza que o recurso não está ligado, em vez de falhar.
 */
export class DisabledPushSender implements PushSender {
  readonly enabled = false;
  readonly publicKey = null;
  private readonly logger = new Logger('Push');

  async send(target: PushTarget, payload: PushPayload): Promise<PushOutcome> {
    this.logger.log(
      `[sem chaves VAPID] push "${payload.tag}" não enviado a ${maskEndpoint(target.endpoint)}`,
    );
    return 'failed';
  }
}
