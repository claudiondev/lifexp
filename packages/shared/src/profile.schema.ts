import { z } from 'zod';
import { avatarKeySchema } from './appearance.js';
import { timezoneSchema } from './user.schema.js';

/** Campos editáveis do perfil. O formulário usa este schema; a API usa a versão parcial abaixo. */
export const profileFieldsSchema = z.strictObject({
  name: z.string().trim().min(1, 'Informe o nome').max(80),
  timezone: timezoneSchema,
  avatarKey: avatarKeySchema,
});

export const updateProfileSchema = profileFieldsSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Informe ao menos um campo para alterar');

export type ProfileFields = z.infer<typeof profileFieldsSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
