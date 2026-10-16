import { z } from 'zod';
import { areaColorSchema } from './appearance.js';
import { civilDateSchema, weekStartSchema } from './primitives.js';

/** Quantas semanas o gráfico mostra por padrão (a atual e as 7 anteriores) e o máximo aceito. */
export const XP_EVOLUTION_DEFAULT_WEEKS = 8;
export const XP_EVOLUTION_MAX_WEEKS = 26;

/** `weeks` vem da URL (texto), por isso `coerce`. Mínimo 2: com uma semana só não há o que comparar. */
export const xpEvolutionQuerySchema = z.strictObject({
  weeks: z.coerce
    .number()
    .int()
    .min(2)
    .max(XP_EVOLUTION_MAX_WEEKS)
    .default(XP_EVOLUTION_DEFAULT_WEEKS),
});

/**
 * XP líquido de uma área numa semana (ganhos menos estornos que caíram nela). Pode ser negativo: estornar na
 * semana seguinte um XP ganho antes tira da semana do estorno (o histórico de XP mostra cada lançamento).
 * Sem área (`areaId` nulo: meta sem área, quest) ou com a área excluída, `color` é nula.
 */
export const xpEvolutionAreaSchema = z.object({
  areaId: z.uuid().nullable(),
  name: z.string(),
  color: areaColorSchema.nullable(),
  amount: z.number().int(),
});

export const xpEvolutionWeekSchema = z
  .object({
    weekStart: weekStartSchema,
    gained: z.number().int().min(0),
    reverted: z.number().int().min(0),
    /** `gained - reverted`. */
    net: z.number().int(),
    /** Só as áreas com valor diferente de zero, da maior para a menor. */
    byArea: z.array(xpEvolutionAreaSchema),
  })
  .refine((week) => week.net === week.gained - week.reverted, {
    message: 'net precisa ser ganhos menos estornos',
    path: ['net'],
  });

export const xpEvolutionSchema = z.object({
  /** Da semana mais antiga para a atual (a última). Sempre inclui semanas sem XP (zeradas). */
  weeks: z.array(xpEvolutionWeekSchema).min(2),
  /** Hoje no fuso da pessoa: a última semana vai até ele. */
  today: civilDateSchema,
});

export type XpEvolutionQuery = z.infer<typeof xpEvolutionQuerySchema>;
export type XpEvolutionArea = z.infer<typeof xpEvolutionAreaSchema>;
export type XpEvolutionWeek = z.infer<typeof xpEvolutionWeekSchema>;
export type XpEvolution = z.infer<typeof xpEvolutionSchema>;
