import { z } from 'zod';
import { queryBooleanSchema } from './query.js';
import { civilDateSchema, timeOfDaySchema } from './primitives.js';

/** Antecedências aceitas para o lembrete de bloco, em minutos (RN24: o padrão é 15). */
export const BLOCK_LEAD_OPTIONS = [5, 10, 15, 30, 60] as const;
export const DEFAULT_BLOCK_LEAD_MIN = 15;
export const DEFAULT_DIGEST_TIME = '07:00';

export const NOTIFICATION_KINDS = ['block', 'event', 'digest'] as const;
export const notificationKindSchema = z.enum(NOTIFICATION_KINDS);

const blockLeadSchema = z.union([
  z.literal(5),
  z.literal(10),
  z.literal(15),
  z.literal(30),
  z.literal(60),
]);

export const notificationSchema = z.object({
  id: z.uuid(),
  kind: notificationKindSchema,
  title: z.string(),
  body: z.string(),
  /** Quando o aviso deveria sair (o instante do lembrete). */
  scheduledFor: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  /** Nulo = não lida. */
  readAt: z.iso.datetime().nullable(),
  /** Origem, para abrir o item certo (bloco + data original, ou evento). */
  blockId: z.uuid().nullable(),
  occurrenceDate: civilDateSchema.nullable(),
  eventId: z.uuid().nullable(),
});

export const MAX_NOTIFICATIONS_PAGE = 100;
export const DEFAULT_NOTIFICATIONS_PAGE = 20;

/** Do mais novo ao mais antigo; `before` é o id do último item da página anterior (RNF08). */
export const listNotificationsQuerySchema = z.object({
  unread: queryBooleanSchema,
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_NOTIFICATIONS_PAGE)
    .default(DEFAULT_NOTIFICATIONS_PAGE),
  before: z.uuid().optional(),
});

export const notificationPageSchema = z.object({
  items: z.array(notificationSchema),
  /** Passe em `before` para a página seguinte; nulo = acabou. */
  nextCursor: z.uuid().nullable(),
});

export const unreadCountSchema = z.object({ count: z.number().int().min(0) });
export const readAllResultSchema = z.object({ updated: z.number().int().min(0) });

export const notificationPreferencesSchema = z.object({
  blockRemindersEnabled: z.boolean(),
  blockLeadMin: blockLeadSchema,
  eventRemindersEnabled: z.boolean(),
  digestEnabled: z.boolean(),
  /** Hora de relógio, no fuso da pessoa, em que o resumo do dia sai. */
  digestTime: timeOfDaySchema,
  digestEmailEnabled: z.boolean(),
});

// strictObject: campos desconhecidos viram erro 400 (RS07).
export const updateNotificationPreferencesSchema = z
  .strictObject({
    blockRemindersEnabled: z.boolean(),
    blockLeadMin: blockLeadSchema,
    eventRemindersEnabled: z.boolean(),
    digestEnabled: z.boolean(),
    digestTime: timeOfDaySchema,
    digestEmailEnabled: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Informe ao menos um campo para alterar');

export type NotificationKindApi = z.infer<typeof notificationKindSchema>;
export type AppNotification = z.infer<typeof notificationSchema>;
export type NotificationPage = z.infer<typeof notificationPageSchema>;
export type NotificationPreferencesDto = z.infer<typeof notificationPreferencesSchema>;
export type UpdateNotificationPreferencesInput = z.infer<
  typeof updateNotificationPreferencesSchema
>;
