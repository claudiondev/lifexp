import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { todayIn, weekStartOf } from '@lifexp/shared';
import { CLOCK, type Clock } from '../clock/clock.js';
import type { Env } from '../config/env.schema.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { QuestService } from './quest.service.js';

/** Chave da trava do agendador de quests (diferente da das notificações; só instâncias da LifeXP a usam). */
export const QUEST_LOCK_KEY = 74_201_002;

export interface QuestScanSummary {
  users: number;
  created: number;
  failures: number;
}

/**
 * Tira o snapshot da quest na virada da semana (RN16): a cada 10 minutos, quem ainda não tem a quest da SUA semana
 * (no fuso da pessoa) e já tem blocos planejados ganha uma. É idempotente, então repetir ou rodar em duas instâncias
 * não duplica; a trava de banco só evita trabalho dobrado.
 */
@Injectable()
export class QuestsScheduler {
  private readonly logger = new Logger(QuestsScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly quests: QuestService,
    private readonly config: ConfigService<Env, true>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async tick(): Promise<void> {
    if (!this.config.get('QUESTS_SCHEDULER', { infer: true })) return;
    try {
      const summary = await this.runOnce(this.clock.now());
      if (summary && summary.created > 0) {
        this.logger.log(`${summary.created} quests semanais criadas para ${summary.users} pessoas`);
      }
    } catch (error) {
      this.logger.error('A criação das quests semanais falhou', error);
    }
  }

  /** Devolve nulo quando outra instância já estava fazendo o trabalho. */
  async runOnce(now: Date): Promise<QuestScanSummary | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(${QUEST_LOCK_KEY}) AS locked`;
        if (!rows[0]?.locked) return null;

        const users = await this.prisma.user.findMany({
          where: { blocks: { some: {} } },
          select: { id: true, timezone: true },
        });
        const summary: QuestScanSummary = { users: users.length, created: 0, failures: 0 };
        for (const { id, timezone } of users) {
          try {
            const weekStart = weekStartOf(todayIn(timezone, now));
            const { created } = await this.quests.ensureForUser(id, weekStart);
            if (created) summary.created += 1;
          } catch (error) {
            // Conta excluída no meio do caminho não é falha (RS15).
            const stillExists = await this.prisma.user.findUnique({
              where: { id },
              select: { id: true },
            });
            if (!stillExists) continue;
            summary.failures += 1;
            this.logger.error(`Falha ao criar a quest semanal da pessoa ${id}`, error);
          }
        }
        return summary;
      },
      { timeout: 55_000, maxWait: 5_000 },
    );
  }
}
