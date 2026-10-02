import { z } from 'zod';

/**
 * Hosts dos serviços de push dos navegadores (RF41). A API só envia para endereços destes serviços: o endpoint
 * vem do cliente, então aceitar qualquer URL deixaria o servidor fazer requisições para onde alguém mandasse (SSRF).
 * Um host vale se for igual a uma entrada ou subdomínio dela.
 */
export const PUSH_SERVICE_HOSTS = [
  'fcm.googleapis.com', // Chrome, Edge e navegadores baseados em Chromium no Android
  'push.services.mozilla.com', // Firefox
  'notify.windows.com', // Edge/Windows (WNS)
  'push.apple.com', // Safari (macOS e iOS 16.4+, com o app instalado)
] as const;

/**
 * Sem `URL` de propósito (este pacote não depende de DOM nem de Node): a regra é "https, host de um serviço conhecido,
 * porta 443 ou nenhuma, sem usuário/senha". O host é seguido de `:443`, `/`, `?`, `#` ou do fim; qualquer outra coisa
 * (`@`, `\`, espaço) reprova.
 */
const ENDPOINT_PATTERN = /^https:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?::443)?(?:[/?#]|$)/i;

export function isAllowedPushEndpoint(endpoint: string): boolean {
  const host = ENDPOINT_PATTERN.exec(endpoint)?.[1]?.toLowerCase();
  if (!host) return false;
  return PUSH_SERVICE_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

const base64Url = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .regex(/^[A-Za-z0-9_-]+={0,2}$/, 'Chave inválida');

/** O que o navegador entrega em `PushSubscription.toJSON()`; `keys` são as chaves de criptografia do aparelho. */
export const pushSubscriptionInputSchema = z.strictObject({
  endpoint: z.string().max(2048).refine(isAllowedPushEndpoint, 'Serviço de push não reconhecido'),
  keys: z.strictObject({
    p256dh: base64Url(20, 200),
    auth: base64Url(10, 100),
  }),
});

export const pushUnsubscribeSchema = z.strictObject({
  endpoint: z.string().max(2048),
});

/** O servidor tem push configurado (chaves VAPID)? Sem isso a tela mostra "indisponível" em vez de pedir permissão. */
export const pushConfigSchema = z.object({
  enabled: z.boolean(),
  /** Chave pública VAPID (base64url), para o navegador criar a inscrição. Nula se desligado. */
  publicKey: z.string().nullable(),
});

/** Quantos aparelhos desta pessoa estão inscritos (os endereços em si nunca voltam para a tela). */
export const pushStatusSchema = z.object({ devices: z.number().int().min(0) });

/** Resultado do "enviar teste": para quantos aparelhos o aviso saiu. */
export const pushTestResultSchema = z.object({ sent: z.number().int().min(0) });

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;
export type PushConfig = z.infer<typeof pushConfigSchema>;
export type PushStatus = z.infer<typeof pushStatusSchema>;
