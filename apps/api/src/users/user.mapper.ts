import type { User as UserEntity } from '../generated/prisma/client.js';
import type { User } from '@lifexp/shared';

/** Nunca devolver a entidade do banco: o passwordHash não pode vazar (RS14). */
export function toUserResponse(user: UserEntity): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    timezone: user.timezone,
    createdAt: user.createdAt.toISOString(),
  };
}
