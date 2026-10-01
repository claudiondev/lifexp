import { z } from 'zod';
import { avatarKeySchema } from './appearance.js';
import { isValidTimezone } from './timezone.js';

export const timezoneSchema = z.string().refine(isValidTimezone, 'Fuso horário inválido');

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  timezone: z.string(),
  avatarKey: avatarKeySchema,
  createdAt: z.iso.datetime(),
});

export type User = z.infer<typeof userSchema>;
