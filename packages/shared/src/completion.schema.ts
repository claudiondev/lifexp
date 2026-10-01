import { z } from 'zod';
import { civilDateSchema } from './primitives.js';

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

/** XP e nível geral e por área (RF20). */
export const progressSchema = z.object({
  total: levelProgressSchema,
  areas: z.array(areaProgressSchema),
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
});

export const undoResultSchema = z.object({
  /** XP devolvido pelo estorno (positivo; o lançamento no livro-caixa é negativo). */
  xpReverted: nonNegativeInt,
  total: levelProgressSchema,
  area: areaProgressSchema.nullable(),
});

export type LevelProgressDto = z.infer<typeof levelProgressSchema>;
export type AreaProgress = z.infer<typeof areaProgressSchema>;
export type Progress = z.infer<typeof progressSchema>;
export type Completion = z.infer<typeof completionSchema>;
export type CompletionResult = z.infer<typeof completionResultSchema>;
export type UndoResult = z.infer<typeof undoResultSchema>;
