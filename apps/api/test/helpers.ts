import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/setup-app.js';

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  setupApp(app);
  await app.init();
  return app;
}

export function uniqueEmail(): string {
  return `${randomUUID()}@test.dev`;
}

export const VALID_PASSWORD = 'senha-de-teste-123';

/** Extrai a linha completa do Set-Cookie do refresh token. */
export function refreshSetCookie(res: request.Response): string | undefined {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined;
  return header?.find((cookie) => cookie.startsWith('refresh_token='));
}

/** Valor do cookie, para reenviar manualmente no header Cookie. */
export function refreshCookieHeader(res: request.Response): string {
  const line = refreshSetCookie(res);
  if (!line) throw new Error('Resposta sem cookie de refresh');
  return line.split(';')[0] as string;
}
