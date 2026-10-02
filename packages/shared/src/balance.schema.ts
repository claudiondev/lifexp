import { z } from 'zod';
import { areaColorSchema, areaIconSchema } from './appearance.js';
import { civilDateSchema } from './primitives.js';

/** Janela do radar de equilíbrio: as últimas 4 semanas (RN41). */
export const BALANCE_WINDOW_WEEKS = 4;

const nonNegativeInt = z.number().int().min(0);

/**
 * Aderência de uma área na janela (RF24, RN41): blocos concluídos ÷ blocos planejados. Conta BLOCOS, nunca
 * minutos nem XP, para que áreas de rotina curta (leitura, meditação) não pareçam abandonadas (RN40, RN42).
 * Sem nenhum bloco planejado a nota é nula: "sem dados" não é o mesmo que zero.
 */
export const balanceAreaSchema = z
  .object({
    areaId: z.uuid(),
    name: z.string(),
    color: areaColorSchema,
    icon: areaIconSchema,
    planned: nonNegativeInt,
    completed: nonNegativeInt,
    /** De 0 a 100, arredondada; nula quando `planned` é 0. */
    score: z.number().int().min(0).max(100).nullable(),
  })
  .refine((area) => area.completed <= area.planned, {
    message: 'concluídos não podem passar dos planejados',
    path: ['completed'],
  })
  .refine((area) => (area.score === null) === (area.planned === 0), {
    message: 'só uma área sem blocos planejados fica sem nota',
    path: ['score'],
  });

export const balanceSchema = z.object({
  /** Primeiro e último dia contados (o último é hoje, no fuso da pessoa). */
  windowStart: civilDateSchema,
  windowEnd: civilDateSchema,
  areas: z.array(balanceAreaSchema),
});

export type BalanceArea = z.infer<typeof balanceAreaSchema>;
export type Balance = z.infer<typeof balanceSchema>;
