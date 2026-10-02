import type { MailMessage, Mailer } from './mailer.js';

const ENDPOINT = 'https://api.resend.com/emails';

/**
 * Envio pela API HTTP do Resend (sem SDK: é uma chamada só). A chave vem do ambiente e nunca vai
 * para mensagem de erro nem para o log.
 */
export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const response = await this.fetcher(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
      // Um provedor lento não pode travar a varredura inteira.
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`O Resend recusou o e-mail (HTTP ${response.status})`);
    }
  }
}
