import { z } from 'zod';
import { queryBooleanSchema } from './query.js';
import { civilDateSchema, timeOfDaySchema } from './primitives.js';

/** Antecedências aceitas para o lembrete de bloco, em minutos (RN24: o padrão é 15). */
export const BLOCK_LEAD_OPTIONS = [5, 10, 15, 30, 60] as const;
export const DEFAULT_BLOCK_LEAD_MIN = 15;
export const DEFAULT_DIGEST_TIME = '07:00';
/** Hora padrão do fechamento da noite: depois do jantar, antes de dormir. */
export const DEFAULT_WRAPUP_TIME = '21:30';

export const NOTIFICATION_KINDS = [
  'block',
  'event',
  'digest',
  'report',
  'checkin',
  'wrapup',
] as const;
export const notificationKindSchema = z.enum(NOTIFICATION_KINDS);

/** Ações do botão da notificação de check-in (RF41): "Cumpri" ou "Pulei", sem abrir o app. */
export const PUSH_ACTIONS = ['complete', 'skip'] as const;
export const pushActionSchema = z.enum(PUSH_ACTIONS);

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
  /** Aviso "seu relatório da semana está pronto", às segundas, na hora do resumo do dia (RF47). */
  weeklyReportEnabled: z.boolean(),
  /** Receber os avisos também como push no celular (RF41); precisa de um aparelho inscrito. */
  pushEnabled: z.boolean(),
  /** "Terminou, cumpriu?" no fim de cada bloco, com botões de ação pelo próprio push. */
  checkinEnabled: z.boolean(),
  /** Fechamento da noite: só chega se sobrou bloco de hoje sem marcar. */
  wrapupEnabled: z.boolean(),
  wrapupTime: timeOfDaySchema,
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
    weeklyReportEnabled: z.boolean(),
    pushEnabled: z.boolean(),
    checkinEnabled: z.boolean(),
    wrapupEnabled: z.boolean(),
    wrapupTime: timeOfDaySchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Informe ao menos um campo para alterar');

/** O que o botão da notificação de check-in manda (RF41): o token de uso único e a ação escolhida. */
export const pushActionRequestSchema = z.strictObject({
  token: z.string().min(1),
  action: pushActionSchema,
});

/** O que o servidor devolve para o service worker mostrar no lugar do aviso original. */
export const pushActionResultSchema = z.object({
  title: z.string(),
  body: z.string(),
});

export type NotificationKindApi = z.infer<typeof notificationKindSchema>;
export type AppNotification = z.infer<typeof notificationSchema>;
export type NotificationPage = z.infer<typeof notificationPageSchema>;
export type NotificationPreferencesDto = z.infer<typeof notificationPreferencesSchema>;
export type UpdateNotificationPreferencesInput = z.infer<
  typeof updateNotificationPreferencesSchema
>;
export type PushActionInput = z.infer<typeof pushActionSchema>;
export type PushActionRequest = z.infer<typeof pushActionRequestSchema>;
export type PushActionResult = z.infer<typeof pushActionResultSchema>;
