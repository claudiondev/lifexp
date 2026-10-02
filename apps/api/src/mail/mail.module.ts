import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';
import { LogMailer } from './log.mailer.js';
import { MAILER, type Mailer } from './mailer.js';
import { ResendMailer } from './resend.mailer.js';

@Global()
@Module({
  providers: [
    {
      provide: MAILER,
      inject: [ConfigService],
      // Com chave: Resend de verdade. Sem chave: só registra no log (dev e testes).
      useFactory: (config: ConfigService<Env, true>): Mailer => {
        const apiKey = config.get('RESEND_API_KEY', { infer: true });
        return apiKey
          ? new ResendMailer(apiKey, config.get('MAIL_FROM', { infer: true }))
          : new LogMailer();
      },
    },
  ],
  exports: [MAILER],
})
export class MailModule {}
