import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/lib/apiClient';
import { useCharacter } from './useCharacter';

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const progress = {
  total: { xp: 250, level: 3, xpIntoLevel: 50, xpForNextLevel: 183, progress: 0.27 },
  areas: [],
  streak: { current: 4, best: 9, lastFulfilledDate: '2026-10-07' },
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useCharacter', () => {
  beforeEach(() => setAccessToken('token'));
  afterEach(() => vi.unstubAllGlobals());

  it('parte do nível 1 sem dados e não finge que está pronto', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => new Promise(() => {})),
    );
    const { result } = renderHook(() => useCharacter(), { wrapper });

    expect(result.current).toMatchObject({ level: 1, xp: 0, levelProgress: 0, ready: false });
  });

  it('traduz o progresso da API para a ficha do personagem', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => json(200, progress)),
    );
    const { result } = renderHook(() => useCharacter(), { wrapper });

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current).toMatchObject({
      level: 3,
      xp: 250,
      levelProgress: 0.27,
      xpIntoLevel: 50,
      xpForNextLevel: 183,
    });
  });

  it('se a API falhar, continua no ponto de partida', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json(500));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useCharacter(), { wrapper });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(result.current.ready).toBe(false);
    expect(result.current.level).toBe(1);
  });
});
