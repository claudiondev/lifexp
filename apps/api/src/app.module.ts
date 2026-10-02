import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { validateEnv } from './config/env.schema.js';
import { AreasModule } from './areas/areas.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ClockModule } from './clock/clock.module.js';
import { BlocksModule } from './blocks/blocks.module.js';
import { EventsModule } from './events/events.module.js';
import { GamificationModule } from './gamification/gamification.module.js';
import { GoalsModule } from './goals/goals.module.js';
import { HealthModule } from './health/health.module.js';
import { MailModule } from './mail/mail.module.js';
import { NotesModule } from './notes/notes.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { ReviewsModule } from './reviews/reviews.module.js';
import { ObservabilityModule } from './observability/observability.module.js';
import { PushModule } from './push/push.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ClockModule,
    ObservabilityModule,
    MailModule,
    PrismaModule,
    PushModule,
    AuthModule,
    UsersModule,
    AreasModule,
    BlocksModule,
    EventsModule,
    GamificationModule,
    GoalsModule,
    HealthModule,
    NotesModule,
    NotificationsModule,
    ReviewsModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
  ],
})
export class AppModule {}
