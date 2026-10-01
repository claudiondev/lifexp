import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import type { AuthResponse, LoginInput, RegisterInput } from '@lifexp/shared';
import type { Env } from '../config/env.schema.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toUserResponse } from '../users/user.mapper.js';
import {
  computeRefreshExpiry,
  generateRefreshToken,
  hashRefreshToken,
} from './domain/refresh-token.js';
import { decideRotation } from './domain/session-rotation.js';

export interface AuthResult {
  body: AuthResponse;
  refreshToken: string;
  refreshMaxAgeMs: number;
}

const INVALID_CREDENTIALS = 'Credenciais inválidas';
const MAX_USER_AGENT_LENGTH = 255;

@Injectable()
export class AuthService {
  // Hash fictício para gastar o mesmo tempo quando o e-mail não existe (evita timing attack, RS13).
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async register(input: RegisterInput, userAgent?: string): Promise<AuthResult> {
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    try {
      const user = await this.prisma.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          timezone: input.timezone,
        },
      });
      return await this.startSession(user, randomUUID(), userAgent);
    } catch (error) {
      // A constraint única é a fonte da verdade: cobre também a corrida entre dois cadastros.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('E-mail já cadastrado');
      }
      throw error;
    }
  }

  async login(input: LoginInput, userAgent?: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const hash = user?.passwordHash ?? (await this.getDummyHash());
    const valid = await argon2.verify(hash, input.password);
    if (!user || !valid) throw new UnauthorizedException(INVALID_CREDENTIALS);
    return this.startSession(user, randomUUID(), userAgent);
  }

  async refresh(refreshToken: string, userAgent?: string): Promise<AuthResult> {
    const now = new Date();
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hashRefreshToken(refreshToken) },
      include: { user: true },
    });

    const decision = decideRotation(session, now);
    if (decision.action === 'revoke_family' && session) {
      await this.revokeFamily(session.tokenFamily, now);
    }
    if (decision.action !== 'rotate' || !session) {
      throw new UnauthorizedException('Sessão inválida');
    }

    // updateMany condicionado a revokedAt = null funciona como um "compare-and-set":
    // se dois refreshes simultâneos chegarem com o mesmo token, só um consegue revogar.
    const rotated = await this.prisma.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: now },
    });
    if (rotated.count === 0) {
      await this.revokeFamily(session.tokenFamily, now);
      throw new UnauthorizedException('Sessão inválida');
    }

    return this.startSession(session.user, session.tokenFamily, userAgent);
  }

  /** Idempotente: sair duas vezes, ou com cookie inexistente, não é erro. */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.prisma.session.updateMany({
      where: { refreshTokenHash: hashRefreshToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async startSession(
    user: Prisma.UserGetPayload<object>,
    tokenFamily: string,
    userAgent?: string,
  ): Promise<AuthResult> {
    const now = new Date();
    const refreshToken = generateRefreshToken();
    const ttlDays = this.config.get('REFRESH_TTL_DAYS');
    const expiresAt = computeRefreshExpiry(now, ttlDays);

    await this.prisma.session.create({
      data: {
        userId: user.id,
        tokenFamily,
        refreshTokenHash: hashRefreshToken(refreshToken),
        userAgent: userAgent?.slice(0, MAX_USER_AGENT_LENGTH),
        expiresAt,
      },
    });

    const accessToken = await this.jwt.signAsync(
      { sub: user.id },
      { expiresIn: this.config.get('ACCESS_TTL_SECONDS') },
    );

    return {
      body: { user: toUserResponse(user), accessToken },
      refreshToken,
      refreshMaxAgeMs: expiresAt.getTime() - now.getTime(),
    };
  }

  private async revokeFamily(tokenFamily: string, now: Date): Promise<void> {
    await this.prisma.session.updateMany({
      where: { tokenFamily, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= argon2.hash('dummy-password', { type: argon2.argon2id });
    return this.dummyHash;
  }
}
