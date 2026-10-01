import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard.js';

function contextWith(request: object): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function makeGuard(options: { isPublic?: boolean; verify?: () => Promise<{ sub: string }> }) {
  const reflector = { getAllAndOverride: () => options.isPublic ?? false } as unknown as Reflector;
  const jwt = {
    verifyAsync: options.verify ?? (() => Promise.reject(new Error('invalid'))),
  } as unknown as JwtService;
  return new JwtAuthGuard(jwt, reflector);
}

describe('JwtAuthGuard', () => {
  it('libera rotas públicas sem token', async () => {
    const guard = makeGuard({ isPublic: true });
    await expect(guard.canActivate(contextWith({ headers: {} }))).resolves.toBe(true);
  });

  it('rejeita requisição sem Authorization', async () => {
    const guard = makeGuard({});
    await expect(guard.canActivate(contextWith({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejeita esquema que não é Bearer', async () => {
    const guard = makeGuard({ verify: () => Promise.resolve({ sub: 'u1' }) });
    const request = { headers: { authorization: 'Basic abc' } };
    await expect(guard.canActivate(contextWith(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejeita token inválido', async () => {
    const guard = makeGuard({});
    const request = { headers: { authorization: 'Bearer ruim' } };
    await expect(guard.canActivate(contextWith(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('aceita token válido e coloca o userId na requisição', async () => {
    const guard = makeGuard({ verify: () => Promise.resolve({ sub: 'user-1' }) });
    const request: { headers: object; user?: { id: string } } = {
      headers: { authorization: 'Bearer bom' },
    };
    await expect(guard.canActivate(contextWith(request))).resolves.toBe(true);
    expect(request.user).toEqual({ id: 'user-1' });
  });
});
