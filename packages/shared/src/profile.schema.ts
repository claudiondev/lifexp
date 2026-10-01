import { z } from 'zod';
import { avatarKeySchema } from './appearance.js';
import { timezoneSchema } from './user.schema.js';

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1, 'Informe o nome').max(80),
    timezone: timezoneSchema,
    avatarKey: avatarKeySchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Informe ao menos um campo para alterar');

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
