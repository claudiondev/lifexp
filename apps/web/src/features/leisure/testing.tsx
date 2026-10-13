import { vi } from 'vitest';
import type { LeisureOption, LeisureSession, LeisureSummary } from '@lifexp/shared';
import { json } from '../tasks/testing';

export { renderWithProviders } from '../tasks/testing';

export const OPTION_INSTAGRAM = '0192f1a0-7b3c-7000-8000-0000000000c1';
export const OPTION_SERIES = '0192f1a0-7b3c-7000-8000-0000000000c2';
export const WEEK_START = '2026-10-05';
/** Quarta-feira 2026-10-07 às 12:00 em São Paulo. */
export const NOW = '2026-10-07T15:00:00.000Z';
const MIN = 60_000;

export const makeOption = (overrides: Partial<LeisureOption> = {}): LeisureOption => ({
  id: OPTION_INSTAGRAM,
  name: 'Instagram',
  icon: 'smartphone',
  archivedAt: null,
  ...overrides,
});

interface StoredSession {
  id: string;
  optionId: string;
  startedAt: number;
  limitMin: number;
  stoppedAt: number | null;
}

export interface Call {
  method: string;
  url: string;
  body?: Record<string, unknown>;
}

interface FakeOptions {
  /** Minutos de lazer já ganhos na semana. */
  earnedMin?: number;
  options?: LeisureOption[];
  /** Falha forçada da consulta do saldo (status). */
  summaryStatus?: number;
  /** Falha forçada de uma escrita: "MÉTODO url" -> { status, message }. */
  fail?: Record<string, { status: number; message: string }>;
}

let counter = 0;
const uuid = () => `0192f1a0-7b3c-7000-8000-${String(++counter + 5000).padStart(12, '0')}`;

/**
 * API falsa em memória que imita as regras do servidor: o limite da sessão é o saldo de agora, a sessão acaba sozinha
 * ao chegar nele, só uma corre por vez. Lê o relógio (`Date.now`), então o teste o move com `vi.setSystemTime`.
 */
export function setupFakeLeisure(fakeOptions: FakeOptions = {}) {
  const state = {
    earnedMin: fakeOptions.earnedMin ?? 0,
    options: [...(fakeOptions.options ?? [makeOption()])],
    sessions: [] as StoredSession[],
  };
  const calls: Call[] = [];

  const endOf = (s: StoredSession) =>
    Math.min(s.stoppedAt ?? Infinity, s.startedAt + s.limitMin * MIN);
  const usedOf = (s: StoredSession, now: number) =>
    Math.max(0, Math.floor((Math.min(endOf(s), now) - s.startedAt) / MIN));
  const running = (s: StoredSession, now: number) => s.stoppedAt === null && now < endOf(s);
  const toSession = (s: StoredSession, now: number): LeisureSession => ({
    id: s.id,
    optionId: s.optionId,
    startedAt: new Date(s.startedAt).toISOString(),
    limitMin: s.limitMin,
    stoppedAt: s.stoppedAt === null ? null : new Date(s.stoppedAt).toISOString(),
    endsAt: new Date(endOf(s)).toISOString(),
    usedMin: usedOf(s, now),
    active: running(s, now),
  });
  const balance = (now: number) =>
    Math.max(0, state.earnedMin - state.sessions.reduce((sum, s) => sum + usedOf(s, now), 0));
  const summary = (now: number): LeisureSummary => {
    const used = state.sessions.reduce((sum, s) => sum + usedOf(s, now), 0);
    const active = state.sessions.find((s) => running(s, now));
    return {
      weekStart: WEEK_START,
      earnedMin: state.earnedMin,
      usedMin: used,
      balanceMin: balance(now),
      activeSession: active ? toSession(active, now) : null,
      byActivity: [],
      sessions: state.sessions.map((s) => toSession(s, now)),
    };
  };

  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : undefined;
      const now = Date.now();

      if (url === '/api/auth/refresh') {
        return json(200, {
          user: {
            id: '0192f1a0-7b3c-7000-8000-000000000001',
            name: 'Ana',
            email: 'ana@mail.com',
            timezone: 'America/Sao_Paulo',
            avatarKey: 'swords',
            createdAt: '2026-10-01T12:00:00.000Z',
          },
          accessToken: 't',
        });
      }
      if (!url.startsWith('/api/leisure')) return json(404, { message: 'não previsto no teste' });
      calls.push({ method, url, ...(body && { body }) });

      const failure = fakeOptions.fail?.[`${method} ${url}`];
      if (failure) return json(failure.status, { message: failure.message });

      if (url === '/api/leisure' && method === 'GET') {
        if (fakeOptions.summaryStatus && fakeOptions.summaryStatus >= 400) {
          return json(fakeOptions.summaryStatus, { message: 'falhou' });
        }
        return json(200, summary(now));
      }
      if (url.startsWith('/api/leisure/options') && method === 'GET') {
        const all = url.includes('includeArchived=true');
        return json(
          200,
          state.options.filter((option) => all || option.archivedAt === null),
        );
      }
      if (url === '/api/leisure/options' && method === 'POST') {
        if (
          state.options.some(
            (o) =>
              o.archivedAt === null &&
              o.name.toLowerCase() === String(body?.['name']).toLowerCase(),
          )
        ) {
          return json(409, { message: 'Você já tem um lazer ativo com esse nome' });
        }
        const option = makeOption({
          id: uuid(),
          name: String(body?.['name']),
          icon: body?.['icon'] as LeisureOption['icon'],
        });
        state.options.push(option);
        return json(201, option);
      }
      const optionMatch = /^\/api\/leisure\/options\/([^/]+)$/.exec(url);
      if (optionMatch && method === 'PATCH') {
        const option = state.options.find((o) => o.id === optionMatch[1]);
        if (!option) return json(404, { message: 'Lazer não encontrado' });
        if (typeof body?.['name'] === 'string') option.name = body['name'];
        if (typeof body?.['icon'] === 'string') option.icon = body['icon'] as LeisureOption['icon'];
        if (typeof body?.['archived'] === 'boolean') {
          option.archivedAt = body['archived'] ? new Date(now).toISOString() : null;
        }
        return json(200, option);
      }
      if (url === '/api/leisure/sessions' && method === 'POST') {
        const option = state.options.find((o) => o.id === body?.['optionId']);
        if (!option) return json(404, { message: 'Lazer não encontrado' });
        if (state.sessions.some((s) => running(s, now))) {
          return json(409, { message: 'Já existe um cronômetro de lazer em andamento' });
        }
        if (balance(now) <= 0) {
          return json(409, { message: 'Você ainda não tem tempo de lazer esta semana.' });
        }
        const session: StoredSession = {
          id: uuid(),
          optionId: option.id,
          startedAt: now,
          limitMin: balance(now),
          stoppedAt: null,
        };
        state.sessions.push(session);
        return json(201, toSession(session, now));
      }
      const stopMatch = /^\/api\/leisure\/sessions\/([^/]+)\/stop$/.exec(url);
      if (stopMatch && method === 'POST') {
        const session = state.sessions.find((s) => s.id === stopMatch[1]);
        if (!session) return json(404, { message: 'Sessão de lazer não encontrada' });
        if (session.stoppedAt === null) session.stoppedAt = Math.min(now, endOf(session));
        return json(200, toSession(session, now));
      }
      return json(404, { message: 'não previsto no teste' });
    }),
  );

  return { calls, state };
}
