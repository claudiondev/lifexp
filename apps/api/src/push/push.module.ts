import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { authThrottler } from '../auth/throttler.js';
import type { Env } from '../config/env.schema.js';
import { PushController } from './push.controller.js';
import { PUSH_SENDER, type PushSender } from './push-sender.js';
import { createPushSender } from './push-sender.factory.js';
import { PushSubscriptionsService } from './push-subscriptions.service.js';

@Global()
@Module({
  imports: [authThrottler],
  controllers: [PushController],
  providers: [
    PushSubscriptionsService,
    {
      provide: PUSH_SENDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): PushSender =>
        createPushSender({
          publicKey: config.get('VAPID_PUBLIC_KEY', { infer: true }),
          privateKey: config.get('VAPID_PRIVATE_KEY', { infer: true }),
          subject: config.get('VAPID_SUBJECT', { infer: true }),
        }),
    },
  ],
  exports: [PUSH_SENDER, PushSubscriptionsService],
})
export class PushModule {}
