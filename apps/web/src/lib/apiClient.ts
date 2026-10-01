import { authResponseSchema, type AuthResponse } from '@lifexp/shared';
import type { ZodType } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// O access token vive só em memória: não vai para localStorage, então um XSS não consegue
// roubá-lo de lá. Ao recarregar a página ele é recuperado pelo cookie httpOnly de refresh.
let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;
let refreshInFlight: Promise<AuthResponse> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

async function toApiError(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null);
  const message =
    typeof body === 'object' && body !== null && 'message' in body
      ? String((body as { message: unknown }).message)
      : `Erro ${response.status}`;
  return new ApiError(response.status, message);
}

function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  return fetch(`/api${path}`, { ...init, headers, credentials: 'same-origin' });
}

async function doRefresh(): Promise<AuthResponse> {
  const response = await request('/auth/refresh', { method: 'POST' });
  if (!response.ok) throw await toApiError(response);
  return authResponseSchema.parse(await response.json());
}

function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks) return task();
  return navigator.locks.request('lifexp-refresh', task) as Promise<T>;
}

/**
 * Um refresh por vez. O refresh token é rotativo e de uso único: duas chamadas com o mesmo
 * cookie parecem "reuso" para o servidor e derrubariam a sessão. Dois cuidados:
 *  - single-flight na aba (várias requisições 401 compartilham a mesma promessa);
 *  - Web Locks entre abas: a segunda aba espera e só envia o refresh depois que a primeira
 *    terminou, já com o cookie rotacionado.
 */
export function refreshSession(): Promise<AuthResponse> {
  refreshInFlight ??= runExclusive(doRefresh)
    .then((result) => {
      accessToken = result.accessToken;
      return result;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

/** fetch autenticado: em 401 tenta renovar a sessão uma vez e repete a requisição. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let response = await request(path, init);

  // Rotas de auth respondem 401 por motivos próprios (senha errada); não adianta renovar.
  const isAuthRoute = path.startsWith('/auth/');
  if (response.status === 401 && !isAuthRoute) {
    try {
      await refreshSession();
    } catch {
      accessToken = null;
      onSessionExpired?.();
      throw new ApiError(401, 'Sessão expirada');
    }
    response = await request(path, init);
  }

  if (!response.ok) throw await toApiError(response);
  return response;
}

export async function apiJson<T>(
  path: string,
  schema: ZodType<T>,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, ...rest } = init;
  const response = await apiFetch(path, {
    ...rest,
    ...(json !== undefined && { body: JSON.stringify(json) }),
  });
  return schema.parse(await response.json());
}
