import { z } from 'zod';
import { civilDateSchema } from './primitives.js';

/** Quantas semanas o mapa de constância mostra por padrão (meio ano) e os limites aceitos. */
export const CONSISTENCY_DEFAULT_WEEKS = 26;
export const CONSISTENCY_MIN_WEEKS = 4;
export const CONSISTENCY_MAX_WEEKS = 53;

/** `weeks` vem da URL (texto), por isso `coerce`. */
export const consistencyQuerySchema = z.strictObject({
  weeks: z.coerce
    .number()
    .int()
    .min(CONSISTENCY_MIN_WEEKS)
    .max(CONSISTENCY_MAX_WEEKS)
    .default(CONSISTENCY_DEFAULT_WEEKS),
});

/**
 * Um dia do mapa: blocos planejados e concluídos. Conta BLOCOS (como o radar, RN41), nunca XP nem minutos. Bloco
 * pulado não conta como planejado (pular não pune, RN11) e um bloco ainda em tempo de ser concluído (hoje e ontem)
 * só entra se já foi concluído.
 */
export const consistencyDaySchema = z
  .object({
    date: civilDateSchema,
    planned: z.number().int().min(0),
    completed: z.number().int().min(0),
  })
  .refine((day) => day.completed <= day.planned, {
    message: 'concluídos não podem passar dos planejados',
    path: ['completed'],
  });

export const consistencySchema = z.object({
  /** Segunda-feira da primeira semana mostrada e hoje (o último dia da lista), no fuso da pessoa. */
  start: civilDateSchema,
  end: civilDateSchema,
  /** Um item por dia de `start` até `end`, em ordem, inclusive os sem nenhum bloco. */
  days: z.array(consistencyDaySchema).min(1),
});

export type ConsistencyQuery = z.infer<typeof consistencyQuerySchema>;
export type ConsistencyDay = z.infer<typeof consistencyDaySchema>;
export type Consistency = z.infer<typeof consistencySchema>;
