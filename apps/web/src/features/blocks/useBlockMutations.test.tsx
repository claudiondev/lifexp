import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/lib/apiClient';
import { balanceKey } from '../balance/useBalance';
import { progressKey } from '../character/useProgress';
import { questKey } from '../quest/useQuest';
import { reviewsKey } from '../reviews/useReviews';
import { todayKey } from '../today/useToday';
import { useBlockMutations } from './useBlockMutations';
import { blocksKey } from './useWeek';

const BLOCK = '0192f1a0-7b3c-7000-8000-0000000000c1';
const exception = {
  blockId: BLOCK,
  occurrenceDate: '2026-10-07',
  type: 'skip',
  newDate: null,
  newStartTime: null,
  newDurationMin: null,
};

describe('useBlockMutations', () => {
  beforeEach(() => setAccessToken('token'));
  afterEach(() => vi.unstubAllGlobals());

  it('pular uma ocorrência invalida tudo o que depende dos blocos planejados', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(
        async () =>
          new Response(JSON.stringify(exception), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const keys = [blocksKey, todayKey, progressKey, reviewsKey, questKey, balanceKey] as const;
    keys.forEach((key) => client.setQueryData(key, { stale: false }));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useBlockMutations(), { wrapper });
    await act(async () => {
      await result.current.setException.mutateAsync({
        blockId: BLOCK,
        occurrenceDate: '2026-10-07',
        input: { type: 'skip' },
      });
    });

    await waitFor(() =>
      keys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(true)),
    );
  });
});
