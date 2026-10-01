import { z } from 'zod';
import { occurrenceSchema } from './block.schema.js';
import { completionSchema, levelProgressSchema } from './completion.schema.js';
import { civilDateSchema } from './primitives.js';

/**
 * Estado de uma ocorrência na tela Hoje:
 *  - upcoming: ainda não começou (RN10: não pode ser concluída);
 *  - open: a janela de conclusão está aberta (do início até 23:59 do dia seguinte, RN08);
 *  - completed: já concluída;
 *  - closed: a janela fechou sem conclusão (sem penalidade, só deixa de poder concluir);
 *  - skipped: pulada (RN11: sem XP e sem penalidade).
 */
export const occurrenceStatusSchema = z.enum([
  'upcoming',
  'open',
  'completed',
  'closed',
  'skipped',
]);

export const todayItemSchema = occurrenceSchema.extend({
  status: occurrenceStatusSchema,
  /** Instante em que a janela abre (início do bloco, no fuso da pessoa). */
  opensAt: z.iso.datetime(),
  /** Instante em que a janela fecha (23:59:59 do dia seguinte ao do bloco). */
  closesAt: z.iso.datetime(),
  /** XP que a conclusão renderia (para mostrar "+60 XP" no botão). */
  xpPreview: z.number().int().min(0),
  completion: completionSchema.nullable(),
});

export const todayResponseSchema = z.object({
  date: civilDateSchema,
  /** Blocos de hoje, mais os de ontem cuja janela ainda está aberta. */
  items: z.array(todayItemSchema),
  /** Soma dos lançamentos de XP de hoje (conclusões menos estornos). */
  xpToday: z.number().int(),
  total: levelProgressSchema,
});

export type OccurrenceStatus = z.infer<typeof occurrenceStatusSchema>;
export type TodayItem = z.infer<typeof todayItemSchema>;
export type TodayResponse = z.infer<typeof todayResponseSchema>;
