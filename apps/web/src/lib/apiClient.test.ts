import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apiFetch,
  ApiError,
  refreshSession,
  setAccessToken,
  setSessionExpiredHandler,
} from './apiClient';

const authBody = {
  user: {
    id: '1',
    name: 'Ana',
    email: 'a@a.com',
    timezone: 'UTC',
    avatarKey: 'swords',
    createdAt: '2026-10-01T12:00:00.000Z',
  },
  accessToken: 'novo-token',
};

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiClient', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    setAccessToken(null);
    setSessionExpiredHandler(null);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('envia o access token no header Authorization', async () => {
    setAccessToken('abc');
    fetchMock.mockResolvedValueOnce(jsonResponse(200));

    await apiFetch('/users/me');

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer abc');
  });

  it('em 401 renova a sessão uma vez e repete a requisição', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401))
      .mockResolvedValueOnce(jsonResponse(200, authBody)) // /auth/refresh
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const response = await apiFetch('/users/me');

    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      '/api/users/me',
      '/api/auth/refresh',
      '/api/users/me',
    ]);
    const retryHeaders = fetchMock.mock.calls[2]?.[1]?.headers as Headers;
    expect(retryHeaders.get('Authorization')).toBe('Bearer novo-token');
  });

  it('não tenta renovar quando a própria rota de auth responde 401', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { message: 'Credenciais inválidas' }));

    await expect(apiFetch('/auth/login', { method: 'POST' })).rejects.toMatchObject({
      status: 401,
      message: 'Credenciais inválidas',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('avisa que a sessão expirou quando o refresh falha', async () => {
    const expired = vi.fn();
    setSessionExpiredHandler(expired);
    fetchMock.mockResolvedValueOnce(jsonResponse(401)).mockResolvedValueOnce(jsonResponse(401));

    await expect(apiFetch('/users/me')).rejects.toBeInstanceOf(ApiError);
    expect(expired).toHaveBeenCalledOnce();
  });

  it('várias chamadas simultâneas compartilham um único refresh', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, authBody));

    await Promise.all([refreshSession(), refreshSession(), refreshSession()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
