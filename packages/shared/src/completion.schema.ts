import { z } from 'zod';
import { achievementKeySchema } from './achievement.schema.js';
import { civilDateSchema, weekStartSchema } from './primitives.js';
import { rewardRefSchema } from './reward.schema.js';

const nonNegativeInt = z.number().int().min(0);

/** Progresso dentro de um nível (geral ou de uma área). */
export const levelProgressSchema = z.object({
  /** XP total acumulado. */
  xp: nonNegativeInt,
  level: z.number().int().min(1),
  xpIntoLevel: nonNegativeInt,
  xpForNextLevel: z.number().int().min(1),
  /** De 0 a 1 dentro do nível atual. */
  progress: z.number().min(0).max(1),
});

export const areaProgressSchema = levelProgressSchema.extend({ areaId: z.uuid() });

/**
 * O coringa semanal (RF26, RN14): 1 por semana, usado automaticamente no primeiro dia planejado perdido
 * da semana em que há sequência a proteger. Não acumula. O estado é o da semana ATUAL.
 */
export const jokerSchema = z
  .object({
    /** Segunda-feira da semana a que o estado se refere. */
    weekStart: weekStartSchema,
    used: z.boolean(),
    /** O dia perdido que o coringa perdoou; nulo se ainda está disponível. */
    usedOn: civilDateSchema.nullable(),
  })
  .refine((joker) => joker.used === (joker.usedOn !== null), {
    message: 'usado e dia perdoado precisam concordar',
    path: ['usedOn'],
  });

/** Sequência de dias planejados cumpridos (RF21). Dias sem bloco planejado são neutros. */
export const streakSchema = z.object({
  /** Dias planejados seguidos em que ao menos um bloco foi cumprido. */
  current: nonNegativeInt,
  /** O maior `current` que a pessoa já teve. */
  best: nonNegativeInt,
  /** Último dia planejado em que cumpriu algo; nulo se ainda não cumpriu nenhum. */
  lastFulfilledDate: civilDateSchema.nullable(),
  joker: jokerSchema,
});

/** XP e nível geral e por área (RF20) e streak (RF21). */
export const progressSchema = z.object({
  total: levelProgressSchema,
  areas: z.array(areaProgressSchema),
  streak: streakSchema,
});

/** Uma ocorrência concluída, identificada por (blockId, occurrenceDate), conforme RN32. */
export const completionSchema = z.object({
  blockId: z.uuid(),
  occurrenceDate: civilDateSchema,
  completedAt: z.iso.datetime(),
  /** XP que esta conclusão rendeu, congelado no momento dela. */
  xpAmount: nonNegativeInt,
});

export const completionResultSchema = z.object({
  completion: completionSchema,
  /** Verdadeiro quando a ocorrência já estava concluída: nada foi ganho de novo. */
  alreadyCompleted: z.boolean(),
  xpAwarded: nonNegativeInt,
  levelBefore: z.number().int().min(1),
  levelAfter: z.number().int().min(1),
  total: levelProgressSchema,
  area: areaProgressSchema,
  /** Bônus da quest semanal que ESTA conclusão destravou (RN17); 0 quando não houve. Já está em `total`. */
  questBonusXp: nonNegativeInt.default(0),
  /** Conquistas que ESTA conclusão desbloqueou (RF23); vazio quando nenhuma. */
  achievementsUnlocked: z.array(achievementKeySchema).default([]),
  /** Recompensas reais cujo gatilho esta conclusão atingiu (RF25); vazio quando nenhuma. */
  rewardsReached: z.array(rewardRefSchema).default([]),
});

export const undoResultSchema = z.object({
  /** XP devolvido pelo estorno (positivo; o lançamento no livro-caixa é negativo). */
  xpReverted: nonNegativeInt,
  total: levelProgressSchema,
  area: areaProgressSchema.nullable(),
  /** Bônus da quest estornado porque desfazer deixou a semana abaixo dos 80%; 0 quando não houve. */
  questBonusReverted: nonNegativeInt.default(0),
});

export type LevelProgressDto = z.infer<typeof levelProgressSchema>;
export type AreaProgress = z.infer<typeof areaProgressSchema>;
export type Joker = z.infer<typeof jokerSchema>;
export type Streak = z.infer<typeof streakSchema>;
export type Progress = z.infer<typeof progressSchema>;
export type Completion = z.infer<typeof completionSchema>;
export type CompletionResult = z.infer<typeof completionResultSchema>;
export type UndoResult = z.infer<typeof undoResultSchema>;
