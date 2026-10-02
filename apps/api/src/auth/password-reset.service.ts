import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import type { ForgotPasswordInput, ResetPasswordInput } from '@lifexp/shared';
import { CLOCK, type Clock } from '../clock/clock.js';
import type { Env } from '../config/env.schema.js';
import { maskEmail } from '../mail/log.mailer.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  buildResetEmail,
  buildResetUrl,
  computeResetExpiry,
  generateResetToken,
  hashResetToken,
  isInCooldown,
  isResetTokenUsable,
} from './domain/password-reset.js';

const INVALID_LINK = 'Link inválido ou expirado';

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  /**
   * Pedido de recuperação (RF05). Não devolve nada e não lança erro por e-mail desconhecido: quem
   * chama responde sempre igual, exista ou não a conta (RS13).
   */
  async request(input: ForgotPasswordInput): Promise<void> {
    const now = this.clock.now();
    const token = generateResetToken();

    const user = await this.prisma.$transaction(async (tx) => {
      // A trava na pessoa enfileira pedidos simultâneos: só o primeiro passa do intervalo.
      const rows = await tx.$queryRaw<{ id: string; name: string; email: string }[]>`
        SELECT "id", "name", "email" FROM "User" WHERE "email" = ${input.email} FOR NO KEY UPDATE`;
      const found = rows[0];
      if (!found) return null;

      const last = await tx.passwordResetToken.findFirst({
        where: { userId: found.id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      if (isInCooldown(last?.createdAt ?? null, now)) return null;

      // Só o link mais novo vale: os anteriores ainda abertos são encerrados.
      await tx.passwordResetToken.updateMany({
        where: { userId: found.id, usedAt: null },
        data: { usedAt: now },
      });
      await tx.passwordResetToken.create({
        data: {
          userId: found.id,
          tokenHash: hashResetToken(token),
          createdAt: now,
          expiresAt: computeResetExpiry(now),
        },
      });
      return found;
    });
    if (!user) return;

    const url = buildResetUrl(this.config.get('APP_URL', { infer: true }), token);
    const email = buildResetEmail({ name: user.name, url });
    // Sem `await` de propósito: o tempo do provedor de e-mail não pode denunciar que a conta existe.
    // No log vai só o endereço mascarado e o motivo; nunca o link nem o token (RS14).
    void this.mailer.send({ to: user.email, ...email }).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : 'erro desconhecido';
      this.logger.warn(
        `Falha ao enviar o e-mail de recuperação para ${maskEmail(user.email)}: ${reason}`,
      );
    });
  }

  /** Redefine a senha com o token do e-mail (uso único, RS12) e encerra todas as sessões. */
  async reset(input: ResetPasswordInput): Promise<void> {
    const tokenHash = hashResetToken(input.token);
    const found = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { expiresAt: true, usedAt: true },
    });
    // Conferência barata antes do argon2 (caro de propósito): link ruim não gasta CPU.
    if (!isResetTokenUsable(found, this.clock.now())) throw new BadRequestException(INVALID_LINK);

    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });

    await this.prisma.$transaction(async (tx) => {
      const now = this.clock.now();
      // "Compare-and-set", como na rotação do refresh token: de dois usos simultâneos do mesmo
      // link, só um consegue marcar o token como usado. A validade é conferida de novo aqui.
      const claimed = await tx.passwordResetToken.updateMany({
        where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count === 0) throw new BadRequestException(INVALID_LINK);

      const { userId } = await tx.passwordResetToken.findUniqueOrThrow({
        where: { tokenHash },
        select: { userId: true },
      });
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      // Quem trocou a senha pode ter sido invadido: todas as sessões caem e é preciso entrar de novo.
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: now },
      });
    });
  }
}
