import {
  notificationPageSchema,
  notificationPreferencesSchema,
  notificationSchema,
  readAllResultSchema,
  unreadCountSchema,
  type AppNotification,
  type NotificationPage,
  type NotificationPreferencesDto,
  type UpdateNotificationPreferencesInput,
} from '@lifexp/shared';
import { apiJson } from '../../lib/apiClient';

export const listNotifications = (cursor?: string): Promise<NotificationPage> =>
  apiJson(`/notifications?limit=20${cursor ? `&before=${cursor}` : ''}`, notificationPageSchema);

export const getUnreadCount = async (): Promise<number> =>
  (await apiJson('/notifications/unread-count', unreadCountSchema)).count;

/** Idempotente: marcar de novo mantém a data da primeira leitura. */
export const markNotificationRead = (id: string): Promise<AppNotification> =>
  apiJson(`/notifications/${id}/read`, notificationSchema, { method: 'POST' });

export const markAllNotificationsRead = (): Promise<number> =>
  apiJson('/notifications/read-all', readAllResultSchema, { method: 'POST' }).then(
    (result) => result.updated,
  );

export const getNotificationPreferences = (): Promise<NotificationPreferencesDto> =>
  apiJson('/notification-preferences', notificationPreferencesSchema);

export const updateNotificationPreferences = (
  input: UpdateNotificationPreferencesInput,
): Promise<NotificationPreferencesDto> =>
  apiJson('/notification-preferences', notificationPreferencesSchema, {
    method: 'PUT',
    json: input,
  });
