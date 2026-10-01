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

export interface TestUser {
  accessToken: string;
  userId: string;
  email: string;
}

/** Cadastra uma pessoa nova (com as áreas padrão) e devolve o necessário para chamar a API. */
export async function registerUser(app: INestApplication): Promise<TestUser> {
  const email = uniqueEmail();
  const res = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ name: 'Ana', email, password: VALID_PASSWORD });
  return { accessToken: res.body.accessToken, userId: res.body.user.id, email };
}

export const bearer = (user: TestUser) => ({ Authorization: `Bearer ${user.accessToken}` });

/** Atividades da pessoa (as padrão criadas no cadastro), na ordem das áreas. */
export async function listActivities(
  app: INestApplication,
  user: TestUser,
  query = '',
): Promise<{ id: string; areaId: string; name: string; archivedAt: string | null }[]> {
  const res = await request(app.getHttpServer()).get(`/api/activities${query}`).set(bearer(user));
  return res.body;
}
