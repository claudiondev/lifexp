import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/lib/apiClient';
import { reviewsKey } from '../reviews/useReviews';
import { useWeeklyReport } from './useWeeklyReport';

const reportFor = (weekStart: string, completed: number) => ({
  weekStart,
  weekEnd: weekStart,
  blocks: { planned: completed, completed, skipped: 0, open: 0, adherence: 100 },
  minutes: 0,
  xp: { gained: 0, reverted: 0, net: 0, byArea: [] },
  areas: [],
  quest: {
    weekStart,
    status: 'none',
    eligible: 0,
    completed: 0,
    target: 0,
    ratio: null,
    bonusXp: 0,
    tiers: [],
    completedAt: null,
  },
  achievements: [],
  goals: { milestones: [], completed: [] },
  streak: {
    current: 0,
    best: 0,
    lastFulfilledDate: null,
    joker: { weekStart, used: false, usedOn: null },
  },
  bestDay: null,
});

describe('useWeeklyReport', () => {
  beforeEach(() => setAccessToken('token'));
  afterEach(() => vi.unstubAllGlobals());

  it('cada semana tem o seu relatório (trocar de semana busca a outra, sem remontar)', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const week = String(input).split('weekStart=')[1]!;
      return new Response(JSON.stringify(reportFor(week, week === '2026-10-05' ? 3 : 7)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result, rerender } = renderHook(({ week }) => useWeeklyReport(week), {
      wrapper,
      initialProps: { week: '2026-10-05' },
    });
    await waitFor(() => expect(result.current.data?.blocks.completed).toBe(3));

    rerender({ week: '2026-09-28' });
    await waitFor(() => expect(result.current.data?.blocks.completed).toBe(7));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a chave nasce dentro da de revisões: invalidar as revisões atualiza o relatório', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(
        async () =>
          new Response(JSON.stringify(reportFor('2026-10-05', 1)), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useWeeklyReport('2026-10-05'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await client.invalidateQueries({ queryKey: reviewsKey });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });
});
