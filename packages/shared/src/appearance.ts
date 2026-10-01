import { z } from 'zod';

/**
 * Cor e ícone são CHAVES, não valores: cada tema (claro/escuro) resolve a chave para a cor certa,
 * e api e web concordam num conjunto fixo e validado.
 */
export const AREA_COLORS = [
  'violet',
  'gold',
  'moss',
  'rose',
  'sky',
  'orange',
  'pink',
  'slate',
] as const;

export const AREA_ICONS = [
  'briefcase',
  'book-open',
  'graduation-cap',
  'users',
  'church',
  'heart-pulse',
  'dumbbell',
  'moon',
  'rocket',
  'code',
  'palette',
  'music',
  'house',
  'plane',
  'utensils',
  'sparkles',
  'sun',
  'leaf',
  'target',
  'star',
] as const;

/** Emblemas que a pessoa escolhe no lugar de um avatar enviado (RF04, sem upload). */
export const AVATAR_KEYS = [
  'swords',
  'shield',
  'book-marked',
  'heart',
  'flame',
  'star',
  'compass',
  'crown',
  'leaf',
  'moon',
  'sun',
  'zap',
] as const;

export const DEFAULT_AVATAR_KEY = 'swords' satisfies (typeof AVATAR_KEYS)[number];

export const areaColorSchema = z.enum(AREA_COLORS);
export const areaIconSchema = z.enum(AREA_ICONS);
export const avatarKeySchema = z.enum(AVATAR_KEYS);

export type AreaColor = z.infer<typeof areaColorSchema>;
export type AreaIcon = z.infer<typeof areaIconSchema>;
export type AvatarKey = z.infer<typeof avatarKeySchema>;
