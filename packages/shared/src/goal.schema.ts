import { z } from 'zod';
import { levelProgressSchema } from './completion.schema.js';
import { civilDateSchema } from './primitives.js';

export const GOAL_STATUSES = ['active', 'completed', 'paused', 'abandoned'] as const;
export const goalStatusSchema = z.enum(GOAL_STATUSES);

const titleSchema = (message: string) => z.string().trim().min(1, message).max(120);
const descriptionSchema = z.string().trim().max(2000);
const unitSchema = z.string().trim().min(1, 'Informe a unidade').max(20);
const targetValueSchema = z.number().positive('O valor-alvo deve ser maior que zero').max(1e9);
const currentValueSchema = z.number().min(0, 'O valor atual não pode ser negativo').max(1e9);

export const milestoneSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  done: z.boolean(),
  doneAt: z.iso.datetime().nullable(),
  position: z.number().int(),
});

/** Progresso da meta (RN19): `ratio` de 0 a 1, ou nulo quando não há como medir. */
export const goalProgressSchema = z.object({
  ratio: z.number().min(0).max(1).nullable(),
  source: z.enum(['metric', 'milestones']).nullable(),
});

export const goalSchema = z.object({
  id: z.uuid(),
  areaId: z.uuid().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  deadline: civilDateSchema.nullable(),
  status: goalStatusSchema,
  unit: z.string().nullable(),
  targetValue: z.number().nullable(),
  currentValue: z.number().nullable(),
  completedAt: z.iso.datetime().nullable(),
  /** Prazo vencido e meta em aberto (RN22). Derivado do dia de hoje, nunca gravado. */
  overdue: z.boolean(),
  progress: goalProgressSchema,
  /** 100% medido: a pessoa pode concluir. A meta nunca conclui sozinha. */
  readyToComplete: z.boolean(),
  milestones: z.array(milestoneSchema),
  /** Minutos dos blocos vinculados já cumpridos (RN35, RF32). */
  investedMinutes: z.number().int().min(0),
});

// strictObject: campos desconhecidos viram erro 400 em vez de ignorados (RS07).
export const createGoalSchema = z
  .strictObject({
    title: titleSchema('Informe o título da meta'),
    description: descriptionSchema.nullish(),
    areaId: z.uuid().nullish(),
    deadline: civilDateSchema.nullish(),
    targetValue: targetValueSchema.nullish(),
    currentValue: currentValueSchema.nullish(),
    unit: unitSchema.nullish(),
  })
  .refine(
    (value) => value.targetValue != null || (value.currentValue == null && value.unit == null),
    { message: 'Valor atual e unidade só existem junto com um valor-alvo', path: ['targetValue'] },
  );

export const updateGoalSchema = z
  .strictObject({
    title: titleSchema('Informe o título da meta'),
    description: descriptionSchema.nullable(),
    areaId: z.uuid().nullable(),
    deadline: civilDateSchema.nullable(),
    /** Nulo remove a métrica (e com ela o valor atual e a unidade). */
    targetValue: targetValueSchema.nullable(),
    currentValue: currentValueSchema.nullable(),
    unit: unitSchema.nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Informe ao menos um campo para alterar');

/** Resultado de uma ação que mexe no XP (concluir/desfazer marco, mudar status): a meta e o XP. */
export const goalActionResultSchema = z.object({
  goal: goalSchema,
  /** XP que entrou (positivo), saiu (negativo) ou 0 quando nada mudou (ação repetida). */
  xpDelta: z.number().int(),
  levelBefore: z.number().int().min(1),
  levelAfter: z.number().int().min(1),
  total: levelProgressSchema,
});

/** Um bloco cumprido que contou para a meta (RF54). */
export const goalHistoryItemSchema = z.object({
  blockId: z.uuid(),
  occurrenceDate: civilDateSchema,
  completedAt: z.iso.datetime(),
  durationMin: z.number().int().min(0),
  xpAmount: z.number().int().min(0),
  activityId: z.uuid(),
  activityName: z.string(),
});

export const goalHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const setGoalStatusSchema = z.strictObject({ status: goalStatusSchema });

export const listGoalsQuerySchema = z.object({ status: goalStatusSchema.optional() });

export const createMilestoneSchema = z.strictObject({
  title: titleSchema('Informe o título do marco'),
});
export const updateMilestoneSchema = createMilestoneSchema;

export type GoalStatus = z.infer<typeof goalStatusSchema>;
export type Milestone = z.infer<typeof milestoneSchema>;
export type Goal = z.infer<typeof goalSchema>;
export type GoalHistoryItem = z.infer<typeof goalHistoryItemSchema>;
export type GoalActionResult = z.infer<typeof goalActionResultSchema>;
export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
