import { z } from 'zod';
import { queryBooleanSchema } from './query.js';

/** RN02: peso da atividade entre 0,5 e 2,0, padrão 1,0. */
export const XP_WEIGHT_MIN = 0.5;
export const XP_WEIGHT_MAX = 2.0;
export const XP_WEIGHT_DEFAULT = 1.0;

const activityNameSchema = z.string().trim().min(1, 'Informe o nome da atividade').max(60);
const xpWeightSchema = z
  .number()
  .min(XP_WEIGHT_MIN, `O peso mínimo é ${XP_WEIGHT_MIN}`)
  .max(XP_WEIGHT_MAX, `O peso máximo é ${XP_WEIGHT_MAX}`);

export const activitySchema = z.object({
  id: z.uuid(),
  areaId: z.uuid(),
  name: z.string(),
  xpWeight: z.number(),
  archivedAt: z.iso.datetime().nullable(),
});

export const createActivitySchema = z.object({
  areaId: z.uuid(),
  name: activityNameSchema,
  xpWeight: xpWeightSchema.default(XP_WEIGHT_DEFAULT),
});

// A atividade não troca de área: mover mudaria o histórico de XP por área.
export const updateActivitySchema = z
  .object({ name: activityNameSchema, xpWeight: xpWeightSchema })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Informe ao menos um campo para alterar');

export const listActivitiesQuerySchema = z.object({
  areaId: z.uuid().optional(),
  includeArchived: queryBooleanSchema,
});

export type Activity = z.infer<typeof activitySchema>;
export type CreateActivityInput = z.infer<typeof createActivitySchema>;
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;
