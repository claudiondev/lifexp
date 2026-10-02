import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { buildDigestEmail } from './domain/digest-email.js';

/** Tentativas por resumo: uma falha do provedor é repetida no minuto seguinte, até este limite. */
export const MAX_EMAIL_ATTEMPTS = 3;
/** Resumo de horas atrás já não serve: depois disso, desiste sem enviar. */
export const EMAIL_FRESH_HOURS = 3;
const BATCH = 200;

export interface EmailSummary {
  sent: number;
  failed: number;
}

@Injectable()
export class DigestEmailService {
  private readonly logger = new Logger(DigestEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Envia por e-mail os resumos do dia ainda não enviados (RF39) de quem ligou essa opção.
   *
   * Quem chama garante uma instância por vez (a varredura roda sob trava de banco, veja
   * NotificationsScheduler.runOnce). A tentativa é contada ANTES de enviar: se a instância cair no
   * meio, a tentativa se perde em vez de virar e-mail duplicado em loop. Falhou? Tenta de novo nos
   * próximos minutos, até MAX_EMAIL_ATTEMPTS. O envio é "ao menos uma vez": só uma queda entre o
   * envio e o registro dele pode repetir um e-mail.
   */
  async sendPending(now: Date): Promise<EmailSummary> {
    const cutoff = new Date(now.getTime() - EMAIL_FRESH_HOURS * 3_600_000);
    const pending = await this.prisma.notification.findMany({
      where: {
        kind: 'DIGEST',
        emailSentAt: null,
        emailAttempts: { lt: MAX_EMAIL_ATTEMPTS },
        // scheduledFor vem do relógio da aplicação (createdAt é do banco): o frescor se mede por ele.
        scheduledFor: { gte: cutoff },
        user: { notificationPreference: { digestEmailEnabled: true } },
      },
      include: { user: { select: { email: true, name: true } } },
      orderBy: { id: 'asc' },
      take: BATCH,
    });

    const summary: EmailSummary = { sent: 0, failed: 0 };
    const appUrl = this.config.get('APP_URL', { infer: true });
    for (const notification of pending) {
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { emailAttempts: { increment: 1 } },
      });

      try {
        const email = buildDigestEmail({
          name: notification.user.name,
          body: notification.body,
          appUrl,
        });
        await this.mailer.send({ to: notification.user.email, ...email });
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: { emailSentAt: now },
        });
        summary.sent += 1;
      } catch (error) {
        summary.failed += 1;
        this.logger.warn(
          `Falha ao enviar o resumo ${notification.id} (tentativa ${notification.emailAttempts + 1} de ${MAX_EMAIL_ATTEMPTS}): ${
            error instanceof Error ? error.message : 'erro desconhecido'
          }`,
        );
      }
    }
    return summary;
  }
}
