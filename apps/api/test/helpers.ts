import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { CLOCK, type Clock } from '../src/clock/clock.js';
import { MAILER, type MailMessage, type Mailer } from '../src/mail/mailer.js';
import { setupApp } from '../src/setup-app.js';

/** E-mail de mentira: guarda o que seria enviado e pode falhar quando o teste quiser. */
export class FakeMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  /** Quantas das próximas chamadas devem falhar (simula o provedor fora do ar). */
  failNext = 0;

  async send(message: MailMessage): Promise<void> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new Error('provedor fora do ar');
    }
    this.sent.push(message);
  }
}

/** Relógio que os testes movem à vontade (a janela de conclusão depende do "agora"). */
export class FakeClock implements Clock {
  private current: Date;

  constructor(iso: string) {
    this.current = new Date(iso);
  }

  now(): Date {
    return new Date(this.current);
  }

  set(iso: string): void {
    this.current = new Date(iso);
  }
}

export async function createTestApp(
  options: { clock?: Clock; mailer?: Mailer } = {},
): Promise<INestApplication> {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  if (options.clock) builder.overrideProvider(CLOCK).useValue(options.clock);
  if (options.mailer) builder.overrideProvider(MAILER).useValue(options.mailer);
  const moduleRef = await builder.compile();
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

/**
 * A invariante central do XP (RN29): os caches (XP total, XP por área e níveis) SEMPRE batem com a
 * soma do livro-caixa. Chamado ao final dos testes de XP para provar que nada ficou inconsistente.
 */
export async function expectCachesConsistent(
  prisma: import('../src/prisma/prisma.service.js').PrismaService,
  userId: string,
): Promise<void> {
  const { levelForXp } = await import('@lifexp/shared');
  const ledger = await prisma.xpTransaction.findMany({ where: { userId } });
  const total = ledger.reduce((sum, entry) => sum + entry.amount, 0);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  expect(user.cachedTotalXp).toBe(total);

  const byArea = new Map<string, number>();
  for (const entry of ledger) {
    if (entry.areaId) byArea.set(entry.areaId, (byArea.get(entry.areaId) ?? 0) + entry.amount);
  }
  const progress = await prisma.areaProgress.findMany({ where: { userId } });
  for (const row of progress) {
    expect(row.cachedXp).toBe(byArea.get(row.areaId) ?? 0);
    expect(row.cachedLevel).toBe(levelForXp(row.cachedXp));
  }
  for (const [areaId, xp] of byArea) {
    const row = progress.find((candidate) => candidate.areaId === areaId);
    expect(row?.cachedXp).toBe(xp);
  }
  // cada estorno anula exatamente o lançamento que ele aponta
  for (const entry of ledger.filter((candidate) => candidate.reversedTransactionId)) {
    const original = ledger.find((candidate) => candidate.id === entry.reversedTransactionId);
    expect(original && original.amount + entry.amount).toBe(0);
  }
}

/**
 * A trava da varredura de notificações é uma só para o banco inteiro, e as suítes e2e rodam em
 * paralelo no mesmo banco: quando outra suíte está varrendo, `runOnce` devolve nulo ("pulei o
 * minuto"). Para o teste isso é só fila: espera e tenta de novo até conseguir varrer.
 */
export async function scanWhenFree<T>(run: () => Promise<T | null>): Promise<T> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const result = await run();
    if (result !== null) return result;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('A trava da varredura não ficou livre a tempo');
}

/**
 * Segura a trava da varredura de notificações (a mesma de `NotificationsScheduler.runOnce`) até chamar a função
 * devolvida. Serve a testes que chamam `sendPending` ou `scanUser` direto: sem isso, a varredura de OUTRA suíte
 * (no mesmo banco, em paralelo) pode enviar ou gerar os avisos deste teste antes dele, e as contagens de tentativas
 * e de envios deixam de ser só dele. Enquanto a trava está presa, `runOnce` das outras suítes "pula o minuto" e
 * `scanWhenFree` espera.
 */
export async function holdScanLock(key: number): Promise<() => Promise<void>> {
  const { default: pg } = await import('pg');
  const { resolveTestDatabase } = await import('./test-db.js');
  const client = new pg.Client({ connectionString: resolveTestDatabase().testUrl });
  await client.connect();
  await client.query('SELECT pg_advisory_lock($1)', [key]);
  return async () => {
    await client.query('SELECT pg_advisory_unlock($1)', [key]);
    await client.end();
  };
}
