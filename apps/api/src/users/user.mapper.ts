import { avatarKeySchema, DEFAULT_AVATAR_KEY, type User } from '@lifexp/shared';
import type { User as UserEntity } from '../generated/prisma/client.js';

/** Nunca devolver a entidade do banco: o passwordHash não pode vazar (RS14). */
export function toUserResponse(user: UserEntity): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    timezone: user.timezone,
    avatarKey: avatarKeySchema.catch(DEFAULT_AVATAR_KEY).parse(user.avatarKey),
    createdAt: user.createdAt.toISOString(),
  };
}
