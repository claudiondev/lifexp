import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CLOCK, type Clock } from '../clock/clock.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Env } from '../config/env.schema.js';
import { DigestEmailService } from './digest-email.service.js';
import { NotificationGenerator } from './notification-generator.service.js';

/** Chave da trava de varredura (qualquer inteiro fixo serve; só as instâncias da LifeXP a usam). */
export const SCAN_LOCK_KEY = 74_201_001;

@Injectable()
export class NotificationsScheduler {
  private readonly logger = new Logger(NotificationsScheduler.name);

  constructor(
    private readonly generator: NotificationGenerator,
    private readonly digestEmail: DigestEmailService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Varredura por minuto (RN38: @nestjs/schedule basta no início). */
  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    if (!this.config.get('NOTIFICATIONS_SCHEDULER', { infer: true })) return;
    try {
      const summary = await this.runOnce(this.clock.now());
      if (summary && summary.created > 0) {
        this.logger.log(`${summary.created} notificações geradas para ${summary.users} pessoas`);
      }
    } catch (error) {
      this.logger.error('A varredura de notificações falhou', error);
    }
  }

  /**
   * Uma varredura protegida por trava de banco: com mais de uma instância da API, só uma varre por
   * vez (as outras pulam o minuto). A trava é "de transação" e some sozinha no fim, mesmo se a
   * instância cair. A idempotência por chave continua sendo a rede de segurança.
   * Devolve nulo quando outra instância já estava varrendo.
   */
  async runOnce(now: Date) {
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(${SCAN_LOCK_KEY}) AS locked`;
        if (!rows[0]?.locked) return null;
        const scan = await this.generator.scanAll(now);
        const email = await this.digestEmail.sendPending(now);
        return { ...scan, emailed: email.sent, emailFailures: email.failed };
      },
      { timeout: 55_000, maxWait: 5_000 },
    );
  }
}
