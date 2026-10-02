import { z } from 'zod';
import { civilDateSchema, weekStartSchema } from './primitives.js';

/** A quest vale ao cumprir 80% dos blocos elegíveis do snapshot da semana (RN17). */
export const QUEST_TARGET_PERCENT = 80;
/** Bônus de 20% do XP elegível da semana (RN17). Sujeito a calibração, como o resto do XP. */
export const QUEST_BONUS_PERCENT = 20;
/** Faixas opcionais de aderência (RN34): só feedback positivo, sem XP e sem punição. */
export const QUEST_TIERS = [80, 90, 100] as const;

const nonNegativeInt = z.number().int().min(0);

export const questStatusSchema = z.enum(['none', 'active', 'completed']);

export const questTierSchema = z.object({
  percent: z.union([z.literal(80), z.literal(90), z.literal(100)]),
  /** Quantos blocos cumpridos bastam para esta faixa. */
  requiredCount: nonNegativeInt,
  reached: z.boolean(),
});

/**
 * A quest semanal (RF22). `none` = a semana não tem quest (nada foi planejado quando ela começou, ou é uma
 * semana antiga de antes do recurso). Os números valem para os blocos do snapshot que AINDA estão planejados:
 * pular um bloco o tira da conta (não pune), e blocos criados depois do snapshot nunca entram (RN18).
 */
export const questSchema = z.object({
  weekStart: civilDateSchema,
  status: questStatusSchema,
  /** Blocos do snapshot que seguem planejados (o que a quest cobra). */
  eligible: nonNegativeInt,
  completed: nonNegativeInt,
  /** Quantos blocos bastam para cumprir a quest (80% de `eligible`, arredondado para cima). */
  target: nonNegativeInt,
  /** `completed ÷ eligible`, ou nulo sem blocos elegíveis. */
  ratio: z.number().min(0).max(1).nullable(),
  /** O bônus em XP: o que será dado (ativa) ou o que foi dado (cumprida). */
  bonusXp: nonNegativeInt,
  tiers: z.array(questTierSchema),
  completedAt: z.iso.datetime().nullable(),
});

export const questQuerySchema = z.object({ weekStart: weekStartSchema.optional() });

export type QuestStatus = z.infer<typeof questStatusSchema>;
export type QuestTier = z.infer<typeof questTierSchema>;
export type Quest = z.infer<typeof questSchema>;
