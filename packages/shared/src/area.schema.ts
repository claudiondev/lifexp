import { z } from 'zod';
import { areaColorSchema, areaIconSchema } from './appearance.js';
import { queryBooleanSchema } from './query.js';

const areaNameSchema = z.string().trim().min(1, 'Informe o nome da área').max(40);

export const areaSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  color: areaColorSchema,
  icon: areaIconSchema,
  position: z.number().int(),
  archivedAt: z.iso.datetime().nullable(),
});

// strictObject: campos desconhecidos viram erro 400 em vez de serem ignorados em silêncio (RS07).
export const createAreaSchema = z.strictObject({
  name: areaNameSchema,
  color: areaColorSchema,
  icon: areaIconSchema,
});

export const updateAreaSchema = z
  .strictObject({
    name: areaNameSchema,
    color: areaColorSchema,
    icon: areaIconSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Informe ao menos um campo para alterar');

export const listAreasQuerySchema = z.object({ includeArchived: queryBooleanSchema });

export type Area = z.infer<typeof areaSchema>;
export type CreateAreaInput = z.infer<typeof createAreaSchema>;
export type UpdateAreaInput = z.infer<typeof updateAreaSchema>;
