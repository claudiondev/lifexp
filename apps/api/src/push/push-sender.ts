/** O que vai no aviso de push (cabe com folga nos ~4 KB que o protocolo aceita). */
export interface PushPayload {
  title: string;
  body: string;
  /** Para onde o toque no aviso leva, sempre um caminho do próprio app. */
  url: string;
  /** Avisos com a mesma etiqueta se substituem em vez de empilhar. */
  tag: string;
}

/** O aparelho inscrito: o endereço do serviço de push do navegador e as chaves que criptografam a mensagem. */
export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * - `sent`: o serviço de push aceitou a mensagem;
 * - `gone`: a inscrição não existe mais (404/410): quem chama a apaga;
 * - `failed`: erro passageiro ou do provedor: vale tentar de novo depois.
 */
export type PushOutcome = 'sent' | 'gone' | 'failed';

/** Quem entrega push (RF41). Troca-se a implementação sem mexer em quem envia, como o `Mailer`. */
export interface PushSender {
  /** Falso sem chaves VAPID: o servidor não aceita inscrições nem tenta enviar. */
  readonly enabled: boolean;
  /** Chave pública VAPID (base64url), que o navegador usa para criar a inscrição. Nula se desligado. */
  readonly publicKey: string | null;
  send(target: PushTarget, payload: PushPayload): Promise<PushOutcome>;
}

/** Token de injeção da implementação ativa. */
export const PUSH_SENDER = Symbol('PUSH_SENDER');
