import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BlocksModule } from '../blocks/blocks.module.js';
import { NotificationGenerator } from './notification-generator.service.js';
import { NotificationPreferencesService } from './notification-preferences.service.js';
import { NotificationsScheduler } from './notifications.scheduler.js';

@Module({
  imports: [ScheduleModule.forRoot(), BlocksModule],
  providers: [NotificationGenerator, NotificationPreferencesService, NotificationsScheduler],
  exports: [NotificationGenerator, NotificationPreferencesService, NotificationsScheduler],
})
export class NotificationsModule {}
