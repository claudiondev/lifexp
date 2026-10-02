import { createZodDto } from 'nestjs-zod';
import {
  listNotificationsQuerySchema,
  notificationPageSchema,
  notificationPreferencesSchema,
  notificationSchema,
  readAllResultSchema,
  unreadCountSchema,
  updateNotificationPreferencesSchema,
} from '@lifexp/shared';

export class NotificationDto extends createZodDto(notificationSchema) {}
export class NotificationPageDto extends createZodDto(notificationPageSchema) {}
export class ListNotificationsQueryDto extends createZodDto(listNotificationsQuerySchema) {}
export class UnreadCountDto extends createZodDto(unreadCountSchema) {}
export class ReadAllResultDto extends createZodDto(readAllResultSchema) {}
export class NotificationPreferencesResponseDto extends createZodDto(
  notificationPreferencesSchema,
) {}
export class UpdateNotificationPreferencesDto extends createZodDto(
  updateNotificationPreferencesSchema,
) {}
