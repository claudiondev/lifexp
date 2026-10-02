import { Logger } from '@nestjs/common';
import type { MailMessage, Mailer } from './mailer.js';

/** Máscara o endereço para o log: "ana@exemplo.com" vira "a**@exemplo.com". */
export function maskEmail(address: string): string {
  const [user = '', domain = ''] = address.split('@');
  return `${user.slice(0, 1)}${'*'.repeat(Math.max(user.length - 1, 0))}@${domain}`;
}

/**
 * Mailer de desenvolvimento e testes: não envia nada, só registra (sem o corpo, que pode ter dados da
 * pessoa). É o que vale quando não há RESEND_API_KEY.
 */
export class LogMailer implements Mailer {
  private readonly logger = new Logger('Mailer');

  async send(message: MailMessage): Promise<void> {
    this.logger.log(`[sem provedor] e-mail "${message.subject}" para ${maskEmail(message.to)}`);
  }
}
