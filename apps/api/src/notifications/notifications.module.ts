import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BlocksModule } from '../blocks/blocks.module.js';
import { ReviewsModule } from '../reviews/reviews.module.js';
import { DigestEmailService } from './digest-email.service.js';
import { NotificationGenerator } from './notification-generator.service.js';
import { NotificationPreferencesService } from './notification-preferences.service.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsScheduler } from './notifications.scheduler.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  imports: [ScheduleModule.forRoot(), BlocksModule, ReviewsModule],
  controllers: [NotificationsController],
  providers: [
    DigestEmailService,
    NotificationGenerator,
    NotificationPreferencesService,
    NotificationsScheduler,
    NotificationsService,
  ],
  exports: [NotificationGenerator, NotificationPreferencesService, NotificationsScheduler],
})
export class NotificationsModule {}
