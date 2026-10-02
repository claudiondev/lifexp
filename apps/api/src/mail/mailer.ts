export interface MailMessage {
  to: string;
  subject: string;
  /** Texto simples: sem HTML, sem imagens, sem rastreio. */
  text: string;
}

/** Quem entrega e-mail. Troca-se a implementação sem mexer em quem envia (como uma interface Java). */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Token de injeção da implementação ativa. */
export const MAILER = Symbol('MAILER');
