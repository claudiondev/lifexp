import { createHash, randomBytes } from 'node:crypto';

/** Validade curta (RS12): tempo de abrir o e-mail e escolher a senha nova. */
export const RESET_TOKEN_TTL_MIN = 30;
/** Intervalo mínimo entre dois e-mails para a mesma conta (ninguém enche a caixa de outra pessoa). */
export const RESET_COOLDOWN_MIN = 2;

const TOKEN_BYTES = 32;
const MS_PER_MIN = 60_000;

/** Token opaco e aleatório (256 bits). Vai uma única vez no link do e-mail; no banco só o hash. */
export function generateResetToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/** SHA-256, como no refresh token: o token já tem alta entropia e precisamos de busca rápida. */
export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function computeResetExpiry(now: Date): Date {
  return new Date(now.getTime() + RESET_TOKEN_TTL_MIN * MS_PER_MIN);
}

/** Já saiu um e-mail há pouco? Então este pedido não gera outro (a resposta ao cliente é a mesma). */
export function isInCooldown(lastRequestAt: Date | null, now: Date): boolean {
  if (lastRequestAt === null) return false;
  return now.getTime() - lastRequestAt.getTime() < RESET_COOLDOWN_MIN * MS_PER_MIN;
}

export interface ResetTokenSnapshot {
  expiresAt: Date;
  usedAt: Date | null;
}

/** Uso único e dentro da validade (RS12). No instante exato em que expira já não vale. */
export function isResetTokenUsable(token: ResetTokenSnapshot | null, now: Date): boolean {
  if (token === null || token.usedAt !== null) return false;
  return token.expiresAt.getTime() > now.getTime();
}

/**
 * O token vai no FRAGMENTO (#) e não na query string: o navegador não envia o fragmento ao servidor,
 * então ele não aparece em log de acesso nem no cabeçalho Referer.
 */
export function buildResetUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, '')}/redefinir-senha#token=${token}`;
}

export interface ResetEmail {
  subject: string;
  text: string;
}

export function buildResetEmail(input: { name: string; url: string }): ResetEmail {
  const firstName = input.name.trim().split(/\s+/)[0] || 'olá';
  return {
    subject: 'Redefinir sua senha do LifeXP',
    text: [
      `Olá, ${firstName}!`,
      '',
      'Recebemos um pedido para redefinir a senha da sua conta no LifeXP.',
      `Para escolher uma senha nova, abra este link (vale por ${RESET_TOKEN_TTL_MIN} minutos e só funciona uma vez):`,
      '',
      input.url,
      '',
      'Se não foi você, ignore este e-mail: sua senha continua a mesma.',
    ].join('\n'),
  };
}
