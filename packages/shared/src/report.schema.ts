import { z } from 'zod';
import { achievementKeySchema } from './achievement.schema.js';
import { areaColorSchema, areaIconSchema } from './appearance.js';
import { streakSchema } from './completion.schema.js';
import { civilDateSchema, weekStartSchema } from './primitives.js';
import { questSchema } from './quest.schema.js';

const nonNegativeInt = z.number().int().min(0);

/**
 * Relatório semanal (RF47), gerado no backend a partir do que a pessoa planejou e cumpriu de segunda a domingo.
 * Mede aderência em BLOCOS, como o radar (RN40 a RN42): minutos e XP aparecem como informação, nunca como nota.
 */
export const reportBlocksSchema = z.object({
  /** Blocos planejados cuja janela de conclusão já fechou, mais os já concluídos. Pulados não entram (RN11). */
  planned: nonNegativeInt,
  completed: nonNegativeInt,
  skipped: nonNegativeInt,
  /** Planejados que ainda dá tempo de concluir (hoje e ontem): não pesam na aderência. */
  open: nonNegativeInt,
  /** `completed ÷ planned` (0 a 100), ou nulo sem blocos contados. */
  adherence: z.number().int().min(0).max(100).nullable(),
});

export const reportAreaSchema = z.object({
  areaId: z.uuid(),
  name: z.string(),
  color: areaColorSchema,
  icon: areaIconSchema,
  planned: nonNegativeInt,
  completed: nonNegativeInt,
  /** Aderência da área na semana; nula sem blocos planejados ("sem dados", não zero). */
  score: z.number().int().min(0).max(100).nullable(),
  /** Minutos dos blocos cumpridos na semana (informativo). */
  minutes: nonNegativeInt,
});

export const reportXpSchema = z.object({
  gained: nonNegativeInt,
  /** XP devolvido por estornos (positivo). */
  reverted: nonNegativeInt,
  net: z.number().int(),
  /** XP líquido por área; `areaId` nulo = XP sem área (bônus da quest, metas sem área). */
  byArea: z.array(
    z.object({ areaId: z.uuid().nullable(), name: z.string(), amount: z.number().int() }),
  ),
});

export const weeklyReportSchema = z.object({
  weekStart: weekStartSchema,
  weekEnd: civilDateSchema,
  blocks: reportBlocksSchema,
  minutes: nonNegativeInt,
  xp: reportXpSchema,
  areas: z.array(reportAreaSchema),
  quest: questSchema,
  achievements: z.array(
    z.object({ key: achievementKeySchema, title: z.string(), unlockedAt: z.iso.datetime() }),
  ),
  goals: z.object({
    milestones: z.array(
      z.object({
        goalId: z.uuid(),
        goalTitle: z.string(),
        title: z.string(),
        doneAt: z.iso.datetime(),
      }),
    ),
    completed: z.array(
      z.object({ id: z.uuid(), title: z.string(), completedAt: z.iso.datetime() }),
    ),
  }),
  /** O streak no fim da semana (ou hoje, se a semana ainda não acabou) e o coringa daquela semana. */
  streak: streakSchema,
  /** O dia com mais blocos cumpridos (empate: o mais cedo); nulo se nada foi cumprido. */
  bestDay: z.object({ date: civilDateSchema, completed: z.number().int().min(1) }).nullable(),
});

export const weeklyReportQuerySchema = z.object({ weekStart: weekStartSchema.optional() });

export type WeeklyReport = z.infer<typeof weeklyReportSchema>;
export type ReportArea = z.infer<typeof reportAreaSchema>;
