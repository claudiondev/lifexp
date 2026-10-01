import { z } from 'zod';
import { DEFAULT_TIMEZONE } from './timezone.js';
import { timezoneSchema, userSchema } from './user.schema.js';

const emailSchema = z.string().trim().toLowerCase().pipe(z.email('E-mail inválido'));

// 72 é o limite de bytes do bcrypt; mantemos o mesmo teto para facilitar trocar de algoritmo.
const passwordSchema = z
  .string()
  .min(8, 'A senha deve ter ao menos 8 caracteres')
  .max(72, 'A senha deve ter no máximo 72 caracteres');

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome').max(80),
  email: emailSchema,
  password: passwordSchema,
  timezone: timezoneSchema.default(DEFAULT_TIMEZONE),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Informe a senha'),
});

export const authResponseSchema = z.object({
  user: userSchema,
  accessToken: z.string(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
