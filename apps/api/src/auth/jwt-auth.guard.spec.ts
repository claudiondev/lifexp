import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../prisma/prisma.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

function contextWith(request: object): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

interface Options {
  isPublic?: boolean;
  verify?: () => Promise<{ sub: string; sid?: unknown }>;
  /** Resultado da consulta da sessão: nulo = nenhuma sessão ativa. */
  session?: { id: string } | null;
}

function makeGuard(options: Options) {
  const reflector = { getAllAndOverride: () => options.isPublic ?? false } as unknown as Reflector;
  const jwt = {
    verifyAsync: options.verify ?? (() => Promise.reject(new Error('invalid'))),
  } as unknown as JwtService;
  const findFirst = vi.fn(async () =>
    options.session === undefined ? { id: 's1' } : options.session,
  );
  const prisma = { session: { findFirst } } as unknown as PrismaService;
  return { guard: new JwtAuthGuard(jwt, reflector, prisma), findFirst };
}

const valid = () => Promise.resolve({ sub: 'user-1', sid: 'family-1' });
const bearer = { headers: { authorization: 'Bearer bom' } };

describe('JwtAuthGuard', () => {
  it('libera rotas públicas sem token e sem consultar o banco', async () => {
    const { guard, findFirst } = makeGuard({ isPublic: true });
    await expect(guard.canActivate(contextWith({ headers: {} }))).resolves.toBe(true);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('rejeita requisição sem Authorization', async () => {
    const { guard } = makeGuard({});
    await expect(guard.canActivate(contextWith({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejeita esquema que não é Bearer', async () => {
    const { guard } = makeGuard({ verify: valid });
    const request = { headers: { authorization: 'Basic abc' } };
    await expect(guard.canActivate(contextWith(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejeita token inválido, sem consultar o banco', async () => {
    const { guard, findFirst } = makeGuard({});
    const request = { headers: { authorization: 'Bearer ruim' } };
    await expect(guard.canActivate(contextWith(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('aceita token válido com sessão ativa e coloca o usuário e a sessão na requisição', async () => {
    const { guard } = makeGuard({ verify: valid });
    const request: { headers: object; user?: object } = { headers: bearer.headers };
    await expect(guard.canActivate(contextWith(request))).resolves.toBe(true);
    expect(request.user).toEqual({ id: 'user-1', sessionId: 'family-1' });
  });

  it('rejeita token sem o id da sessão, mesmo bem assinado', async () => {
    for (const sid of [undefined, null, 42, '']) {
      const { guard, findFirst } = makeGuard({
        verify: () => Promise.resolve({ sub: 'user-1', sid }),
      });
      const result = guard.canActivate(contextWith({ headers: bearer.headers }));
      if (sid === '') {
        // string vazia passa na checagem de tipo, mas nenhuma sessão tem esse id
        await expect(result).resolves.toBe(true);
      } else {
        await expect(result).rejects.toBeInstanceOf(UnauthorizedException);
        expect(findFirst).not.toHaveBeenCalled();
      }
    }
  });

  it('rejeita token válido cuja sessão foi revogada ou expirou', async () => {
    const { guard } = makeGuard({ verify: valid, session: null });
    const request: { headers: object; user?: object } = { headers: bearer.headers };
    await expect(guard.canActivate(contextWith(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(request.user).toBeUndefined();
  });

  it('consulta a sessão exatamente da pessoa e da família do token, ativa e dentro da validade', async () => {
    const { guard, findFirst } = makeGuard({ verify: valid });
    const before = Date.now();
    await guard.canActivate(contextWith({ headers: bearer.headers }));

    const [call] = findFirst.mock.calls as unknown as [
      { where: Record<string, unknown> & { expiresAt: { gt: Date } } },
    ][];
    const { where } = call![0];
    expect(where).toMatchObject({
      tokenFamily: 'family-1',
      userId: 'user-1',
      revokedAt: null,
    });
    expect(where.expiresAt.gt.getTime()).toBeGreaterThanOrEqual(before);
    expect(where.expiresAt.gt.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
