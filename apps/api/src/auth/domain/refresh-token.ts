import { createHash, randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Token opaco e aleatório (256 bits). Vai para o cookie; no banco só vai o hash. */
export function generateRefreshToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * SHA-256 e não argon2: o token já tem alta entropia, então não há o que "forçar".
 * Argon2/bcrypt existem para senhas, que são fracas. Aqui precisamos de lookup rápido por hash.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function computeRefreshExpiry(now: Date, ttlDays: number): Date {
  return new Date(now.getTime() + ttlDays * MS_PER_DAY);
}
