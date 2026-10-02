import { z } from 'zod';
import { achievementKeySchema } from './achievement.schema.js';

/** Limite por pessoa: recompensa é um cadastro pessoal, não uma lista infinita. */
export const MAX_REWARDS = 50;

const titleSchema = z.string().trim().min(1, 'Informe o nome da recompensa').max(100);
const descriptionSchema = z.string().trim().max(500);

/**
 * O gatilho de uma recompensa real (RF25): o que precisa acontecer para ela poder ser resgatada.
 * strictObject em cada tipo: campo que não é do tipo vira erro 400 em vez de ser ignorado (RS07).
 */
export const rewardTriggerSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('level'), threshold: z.number().int().min(2).max(100) }),
  z.strictObject({ type: z.literal('streak'), threshold: z.number().int().min(1).max(365) }),
  z.strictObject({
    type: z.literal('total_xp'),
    threshold: z.number().int().min(1).max(1_000_000),
  }),
  z.strictObject({ type: z.literal('achievement'), achievementKey: achievementKeySchema }),
]);

/** `locked` = gatilho ainda não atingido; `available` = atingido e não resgatada; `redeemed` = resgatada. */
export const rewardStatusSchema = z.enum(['locked', 'available', 'redeemed']);

export const rewardSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  trigger: rewardTriggerSchema,
  status: rewardStatusSchema,
  /** Quando o gatilho foi atingido (e continua valendo mesmo que o streak caia depois). */
  reachedAt: z.iso.datetime().nullable(),
  redeemedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export const createRewardSchema = z.strictObject({
  title: titleSchema,
  description: descriptionSchema.nullish(),
  trigger: rewardTriggerSchema,
});

/** O gatilho não muda depois de criado: para trocá-lo, exclua e crie outra (evita "atingir" e depois mudar a regra). */
export const updateRewardSchema = z
  .strictObject({ title: titleSchema, description: descriptionSchema.nullable() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Informe ao menos um campo para alterar');

export type RewardTrigger = z.infer<typeof rewardTriggerSchema>;
export type RewardStatus = z.infer<typeof rewardStatusSchema>;
export type Reward = z.infer<typeof rewardSchema>;
export type CreateRewardInput = z.infer<typeof createRewardSchema>;
export type UpdateRewardInput = z.infer<typeof updateRewardSchema>;
