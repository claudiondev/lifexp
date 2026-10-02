import { Logger } from '@nestjs/common';
import type { MailMessage, Mailer } from './mailer.js';

/** Máscara o endereço para o log: "ana@exemplo.com" vira "a**@exemplo.com". */
export function maskEmail(address: string): string {
  const [user = '', domain = ''] = address.split('@');
  return `${user.slice(0, 1)}${'*'.repeat(Math.max(user.length - 1, 0))}@${domain}`;
}

/**
 * Mailer de desenvolvimento e testes: não envia nada, só registra. É o que vale quando não há
 * RESEND_API_KEY.
 *
 * O corpo só aparece com `showBody` (ligado apenas em desenvolvimento): é o jeito de abrir o link de
 * recuperação de senha sem provedor de e-mail. Em produção o corpo NUNCA vai para o log: ele pode
 * ter dados da pessoa e o token de recuperação (RS14).
 */
export class LogMailer implements Mailer {
  private readonly logger = new Logger('Mailer');

  constructor(private readonly showBody = false) {}

  async send(message: MailMessage): Promise<void> {
    this.logger.log(`[sem provedor] e-mail "${message.subject}" para ${maskEmail(message.to)}`);
    if (this.showBody)
      this.logger.log(`[sem provedor] corpo (só em desenvolvimento):\n${message.text}`);
  }
}
