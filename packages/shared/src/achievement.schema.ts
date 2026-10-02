import { z } from 'zod';

/**
 * As conquistas (RF23). O catálogo é fixo e vive no código: o banco só guarda QUAIS a pessoa já
 * desbloqueou. Uma vez desbloqueada, a conquista é permanente: desfazer uma conclusão depois não a retira
 * (o app recompensa o que foi feito, nunca pune).
 */
export const ACHIEVEMENT_KEYS = [
  'first_step',
  'full_week',
  'constant',
  'unshakeable',
  'balanced',
  'hundred_hours',
  'dream_realized',
  'deserved_rest',
] as const;

export const achievementKeySchema = z.enum(ACHIEVEMENT_KEYS);
export type AchievementKey = z.infer<typeof achievementKeySchema>;

/** Limiares das conquistas com número (valores sujeitos a calibração, como o resto do XP). */
export const CONSTANT_STREAK_DAYS = 7;
export const UNSHAKEABLE_STREAK_DAYS = 30;
export const HUNDRED_HOURS_MINUTES = 6000;
export const DESERVED_REST_BLOCKS = 10;
/** "Equilibrado": cada área ativa cumpre ao menos esta parte do que planejou na semana (a mesma da quest, RN17). */
export const BALANCED_AREA_PERCENT = 80;

export interface AchievementInfo {
  title: string;
  description: string;
}

/** Exaustivo de propósito: uma conquista nova em `ACHIEVEMENT_KEYS` quebra o build até ganhar texto. */
export const ACHIEVEMENT_CATALOG: Record<AchievementKey, AchievementInfo> = {
  first_step: { title: 'Primeiro passo', description: 'Cumpra o seu primeiro bloco.' },
  full_week: {
    title: 'Semana completa',
    description: 'Conclua a sua primeira quest semanal.',
  },
  constant: {
    title: 'Constante',
    description: `Chegue a ${CONSTANT_STREAK_DAYS} dias planejados seguidos de streak.`,
  },
  unshakeable: {
    title: 'Inabalável',
    description: `Chegue a ${UNSHAKEABLE_STREAK_DAYS} dias planejados seguidos de streak.`,
  },
  balanced: {
    title: 'Equilibrado',
    description: `Numa mesma semana, cumpra ${BALANCED_AREA_PERCENT}% do que planejou em todas as suas áreas ativas.`,
  },
  hundred_hours: {
    title: '100 horas',
    description: 'Some 100 horas de blocos cumpridos numa mesma área.',
  },
  dream_realized: { title: 'Sonho realizado', description: 'Conclua a sua primeira meta.' },
  deserved_rest: {
    title: 'Descanso merecido',
    description: `Cumpra ${DESERVED_REST_BLOCKS} blocos da área Descanso.`,
  },
};

/** Quanto falta nas conquistas que se medem em números (as demais não têm barra). */
export const achievementProgressSchema = z.object({
  current: z.number().int().min(0),
  target: z.number().int().min(1),
});

export const achievementSchema = z
  .object({
    key: achievementKeySchema,
    title: z.string(),
    description: z.string(),
    unlocked: z.boolean(),
    unlockedAt: z.iso.datetime().nullable(),
    progress: achievementProgressSchema.nullable(),
  })
  .refine((achievement) => achievement.unlocked === (achievement.unlockedAt !== null), {
    message: 'desbloqueada e data de desbloqueio precisam concordar',
    path: ['unlockedAt'],
  });

export const achievementListSchema = z.array(achievementSchema);

export type Achievement = z.infer<typeof achievementSchema>;
