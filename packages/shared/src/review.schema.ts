import { z } from 'zod';
import { areaColorSchema, areaIconSchema } from './appearance.js';
import { civilDateSchema, weekStartSchema } from './primitives.js';

/** Cada campo da reflexão cabe em um parágrafo longo; o limite protege o banco e a tela. */
export const REVIEW_TEXT_MAX = 2000;
export const MAX_REVIEWS_PAGE = 50;
export const DEFAULT_REVIEWS_PAGE = 20;

const nonNegativeInt = z.number().int().min(0);
/** 0 a 1; nulo quando nada foi planejado (não existe "0%" de nada). */
const adherenceSchema = z.number().min(0).max(1).nullable();

/** Aderência de uma área na semana: blocos planejados × cumpridos. Pular não conta como planejado. */
export const areaAdherenceSchema = z.object({
  areaId: z.uuid(),
  name: z.string(),
  color: areaColorSchema,
  icon: areaIconSchema,
  planned: nonNegativeInt,
  completed: nonNegativeInt,
  plannedMin: nonNegativeInt,
  completedMin: nonNegativeInt,
  adherence: adherenceSchema,
});

export const weekTotalsSchema = z.object({
  planned: nonNegativeInt,
  completed: nonNegativeInt,
  plannedMin: nonNegativeInt,
  completedMin: nonNegativeInt,
  /** Ocorrências que a pessoa decidiu pular: informativo, nunca penaliza. */
  skipped: nonNegativeInt,
  adherence: adherenceSchema,
  /** XP líquido da semana (ganhos menos estornos). */
  xp: z.number().int(),
});

/** Resumo da semana (RF46): o que foi planejado, o que foi cumprido e o XP, por área e no total. */
export const weekSummarySchema = z.object({
  weekStart: civilDateSchema,
  weekEnd: civilDateSchema,
  totals: weekTotalsSchema,
  areas: z.array(areaAdherenceSchema),
});

const reviewTextSchema = z
  .string()
  .trim()
  .max(REVIEW_TEXT_MAX, `No máximo ${REVIEW_TEXT_MAX} caracteres`);

/** A reflexão guiada: o que deu certo, o que travou e a prioridade da semana seguinte. */
export const weeklyReviewSchema = z.object({
  weekStart: civilDateSchema,
  wins: z.string(),
  blockers: z.string(),
  nextPriority: z.string(),
  updatedAt: z.iso.datetime(),
});

/** Substitui a revisão da semana. Os três campos são obrigatórios, mas podem ficar vazios. */
export const updateReviewSchema = z.strictObject({
  wins: reviewTextSchema,
  blockers: reviewTextSchema,
  nextPriority: reviewTextSchema,
});

export const reviewWeekParamSchema = z.object({ weekStart: weekStartSchema });

/** A tela de uma semana: o resumo, a revisão (se já escrita) e a prioridade combinada na semana anterior. */
export const reviewDetailSchema = z.object({
  summary: weekSummarySchema,
  review: weeklyReviewSchema.nullable(),
  /** A prioridade que a pessoa definiu, na revisão da semana anterior, para ESTA semana. */
  previousPriority: z.string().nullable(),
});

/** Do mais recente ao mais antigo; `before` é a semana (segunda-feira) do último item da página anterior. */
export const listReviewsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_REVIEWS_PAGE).default(DEFAULT_REVIEWS_PAGE),
  before: weekStartSchema.optional(),
});

export const reviewListItemSchema = z.object({
  weekStart: civilDateSchema,
  nextPriority: z.string(),
  updatedAt: z.iso.datetime(),
});

export const reviewPageSchema = z.object({
  items: z.array(reviewListItemSchema),
  nextCursor: civilDateSchema.nullable(),
});

export type AreaAdherence = z.infer<typeof areaAdherenceSchema>;
export type WeekTotals = z.infer<typeof weekTotalsSchema>;
export type WeekSummary = z.infer<typeof weekSummarySchema>;
export type WeeklyReview = z.infer<typeof weeklyReviewSchema>;
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;
export type ReviewDetail = z.infer<typeof reviewDetailSchema>;
export type ReviewListItem = z.infer<typeof reviewListItemSchema>;
export type ReviewPage = z.infer<typeof reviewPageSchema>;
