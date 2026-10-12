import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { authThrottler } from '../auth/throttler.js';
import { BlocksModule } from '../blocks/blocks.module.js';
import { GamificationModule } from '../gamification/gamification.module.js';
import { ReviewsModule } from '../reviews/reviews.module.js';
import { DigestEmailService } from './digest-email.service.js';
import { PushNotifier } from './push-notifier.service.js';
import { NotificationGenerator } from './notification-generator.service.js';
import { NotificationPreferencesService } from './notification-preferences.service.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsScheduler } from './notifications.scheduler.js';
import { NotificationsService } from './notifications.service.js';
import { PushActionsController } from './push-actions.controller.js';
import { PushActionsService } from './push-actions.service.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BlocksModule,
    GamificationModule,
    ReviewsModule,
    authThrottler,
  ],
  controllers: [NotificationsController, PushActionsController],
  providers: [
    DigestEmailService,
    NotificationGenerator,
    NotificationPreferencesService,
    NotificationsScheduler,
    PushNotifier,
    NotificationsService,
    PushActionsService,
  ],
  exports: [NotificationGenerator, NotificationPreferencesService, NotificationsScheduler],
})
export class NotificationsModule {}
