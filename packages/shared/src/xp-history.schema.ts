import { z } from 'zod';

/**
 * Origens de um lançamento do livro-caixa de XP (RF53). `reversal` é o estorno de qualquer uma das
 * outras. "Quest" entra aqui quando existir (fase 4).
 */
export const XP_ENTRY_TYPES = ['completion', 'milestone', 'goal', 'reversal'] as const;
export const xpEntryTypeSchema = z.enum(XP_ENTRY_TYPES);

/** Origens que geram XP (tudo menos o estorno). */
export const xpSourceTypeSchema = xpEntryTypeSchema.exclude(['reversal']);

export const xpHistoryEntrySchema = z
  .object({
    id: z.uuid(),
    type: xpEntryTypeSchema,
    /** Positivo no ganho, negativo no estorno; nunca zero. */
    amount: z.number().int(),
    areaId: z.uuid().nullable(),
    areaName: z.string().nullable(),
    createdAt: z.iso.datetime(),
    /** Nome da atividade, do marco ou da meta; nulo = a origem foi excluída. */
    sourceLabel: z.string().nullable(),
    /** Só no estorno: a origem do lançamento estornado. */
    reversedType: xpSourceTypeSchema.nullable(),
  })
  .refine((entry) => entry.amount !== 0, 'Lançamento sem valor')
  .refine(
    (entry) => (entry.type === 'reversal') === (entry.reversedType !== null),
    'reversedType existe só no estorno',
  )
  .refine((entry) => (entry.type === 'reversal') === entry.amount < 0, 'Só o estorno é negativo');

export const MAX_XP_HISTORY_PAGE = 50;
export const DEFAULT_XP_HISTORY_PAGE = 20;

/** Do mais novo ao mais antigo; `before` é o id do último item da página anterior (RNF08). */
export const xpHistoryQuerySchema = z.object({
  type: xpEntryTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_XP_HISTORY_PAGE).default(DEFAULT_XP_HISTORY_PAGE),
  before: z.uuid().optional(),
});

export const xpHistoryPageSchema = z.object({
  items: z.array(xpHistoryEntrySchema),
  /** Passe em `before` para a página seguinte; nulo = acabou. */
  nextCursor: z.uuid().nullable(),
});

export type XpEntryType = z.infer<typeof xpEntryTypeSchema>;
export type XpSourceType = z.infer<typeof xpSourceTypeSchema>;
export type XpHistoryEntry = z.infer<typeof xpHistoryEntrySchema>;
export type XpHistoryQuery = z.infer<typeof xpHistoryQuerySchema>;
export type XpHistoryPage = z.infer<typeof xpHistoryPageSchema>;
