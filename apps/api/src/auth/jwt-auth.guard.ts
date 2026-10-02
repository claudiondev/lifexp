import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedRequest } from './authenticated-user.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';

interface AccessTokenPayload {
  sub: string;
  /** Família do refresh token (a sessão) que emitiu este access token. */
  sid?: unknown;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);
    if (!token) throw new UnauthorizedException('Não autenticado');

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Não autenticado');
    }
    if (typeof payload.sid !== 'string') throw new UnauthorizedException('Não autenticado');

    // A assinatura sozinha não basta: sair, revogar um dispositivo ou redefinir a senha precisam
    // valer na hora, não só quando o token de 15 minutos expirar. Uma consulta indexada por requisição.
    const active = await this.prisma.session.findFirst({
      where: {
        tokenFamily: payload.sid,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (!active) throw new UnauthorizedException('Não autenticado');

    request.user = { id: payload.sub, sessionId: payload.sid };
    return true;
  }

  private extractBearerToken(request: AuthenticatedRequest): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' && token ? token : undefined;
  }
}
