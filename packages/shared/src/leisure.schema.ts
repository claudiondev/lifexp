import { z } from 'zod';
import { weekStartSchema } from './primitives.js';

/**
 * Tempo de lazer: atividades produtivas rendem minutos de lazer que a pessoa gasta com um cronômetro.
 * A proporção é um percentual FIXO por atividade (25 = 4 h rendem 1 h; 50 = 2 h rendem 1 h; 100 = 1 h rende 1 h);
 * nulo = a atividade não gera lazer.
 */
export const LEISURE_PERCENTS = [25, 50, 100] as const;
export const leisurePercentSchema = z.union([z.literal(25), z.literal(50), z.literal(100)]);
export type LeisurePercent = (typeof LEISURE_PERCENTS)[number];

/** Limites do cadastro de lazeres (Instagram, TikTok, série...). */
export const MAX_LEISURE_OPTIONS = 20;
export const LEISURE_NAME_MAX = 40;
/** Cabe numa semana inteira: o saldo nunca passa disso. */
export const MAX_LEISURE_SESSION_MIN = 7 * 24 * 60;

/** Ícone é CHAVE de lista fixa (como nas áreas): o front resolve em ícone e cor por tema. */
export const LEISURE_ICONS = [
  'smartphone',
  'music',
  'tv',
  'gamepad',
  'film',
  'coffee',
  'headphones',
  'message-circle',
  'play',
  'sparkles',
] as const;
export const leisureIconSchema = z.enum(LEISURE_ICONS);
export type LeisureIcon = z.infer<typeof leisureIconSchema>;

const optionNameSchema = z.string().trim().min(1, 'Informe o nome do lazer').max(LEISURE_NAME_MAX);

export const leisureOptionSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  icon: leisureIconSchema,
  archivedAt: z.iso.datetime().nullable(),
});

export const createLeisureOptionSchema = z.strictObject({
  name: optionNameSchema,
  icon: leisureIconSchema,
});

/** `archived: true` arquiva e `false` restaura (nunca se exclui). */
export const updateLeisureOptionSchema = z
  .strictObject({ name: optionNameSchema, icon: leisureIconSchema, archived: z.boolean() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Informe ao menos um campo para alterar');

export const startLeisureSessionSchema = z.strictObject({ optionId: z.uuid() });

const nonNegativeInt = z.number().int().min(0);

export const leisureSessionSchema = z.object({
  id: z.uuid(),
  optionId: z.uuid(),
  startedAt: z.iso.datetime(),
  /** O saldo no momento em que a sessão começou: ela acaba sozinha ao chegar nele. */
  limitMin: z.number().int().min(1).max(MAX_LEISURE_SESSION_MIN),
  /** Quando a pessoa parou; nulo = ainda não parou (pode já ter passado do limite). */
  stoppedAt: z.iso.datetime().nullable(),
  /** O instante em que a sessão acaba (ou acabou): o menor entre `stoppedAt` e `startedAt + limitMin`. */
  endsAt: z.iso.datetime(),
  /** Minutos usados até agora (ou no total, se já acabou). */
  usedMin: nonNegativeInt,
  /** Ainda correndo: não parou e o limite não chegou. */
  active: z.boolean(),
});

/** Quanto cada atividade rendeu na semana. */
export const leisureByActivitySchema = z.object({
  activityId: z.uuid(),
  name: z.string(),
  /** Minutos cumpridos na semana. */
  doneMin: nonNegativeInt,
  /** Minutos de lazer que esses blocos renderam. */
  earnedMin: nonNegativeInt,
});

export const leisureSummarySchema = z.object({
  /** Segunda-feira da semana a que o saldo se refere. */
  weekStart: weekStartSchema,
  earnedMin: nonNegativeInt,
  usedMin: nonNegativeInt,
  /** Nunca negativo: se um estorno vier depois do uso, mostra 0 (não vira dívida). */
  balanceMin: nonNegativeInt,
  activeSession: leisureSessionSchema.nullable(),
  byActivity: z.array(leisureByActivitySchema),
  sessions: z.array(leisureSessionSchema),
});

export type LeisureOption = z.infer<typeof leisureOptionSchema>;
export type CreateLeisureOptionInput = z.infer<typeof createLeisureOptionSchema>;
export type UpdateLeisureOptionInput = z.infer<typeof updateLeisureOptionSchema>;
export type StartLeisureSessionInput = z.infer<typeof startLeisureSessionSchema>;
export type LeisureSession = z.infer<typeof leisureSessionSchema>;
export type LeisureByActivity = z.infer<typeof leisureByActivitySchema>;
export type LeisureSummary = z.infer<typeof leisureSummarySchema>;
