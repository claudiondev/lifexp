import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/lib/apiClient';
import { blocksKey } from '../blocks/useWeek';
import { progressKey } from '../character/useProgress';
import { questKey } from '../quest/useQuest';
import { useCompletionMutations } from './useCompletionMutations';
import { todayKey } from './useToday';

const BLOCK = '0192f1a0-7b3c-7000-8000-0000000000c1';
const AREA = '0192f1a0-7b3c-7000-8000-0000000000b1';
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
const level = { xp: 90, level: 1, xpIntoLevel: 90, xpForNextLevel: 100, progress: 0.9 };

describe('useCompletionMutations', () => {
  beforeEach(() => setAccessToken('token'));
  afterEach(() => vi.unstubAllGlobals());

  it.each(['complete', 'undo'] as const)(
    '%s invalida a lista de hoje, o progresso, a quest e as semanas em cache',
    async (action) => {
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>(async (_input, init) =>
          init?.method === 'POST'
            ? json({
                completion: {
                  blockId: BLOCK,
                  occurrenceDate: '2026-10-07',
                  completedAt: '2026-10-07T13:00:00.000Z',
                  xpAmount: 90,
                },
                alreadyCompleted: false,
                xpAwarded: 90,
                levelBefore: 1,
                levelAfter: 1,
                total: level,
                area: { areaId: AREA, ...level },
              })
            : json({ xpReverted: 90, total: level, area: null }),
        ),
      );
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const keys = [todayKey, progressKey, questKey, [...blocksKey, 'week', '2026-10-05']] as const;
      keys.forEach((key) => client.setQueryData(key, { stale: false }));
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useCompletionMutations(), { wrapper });
      const ref = { blockId: BLOCK, occurrenceDate: '2026-10-07' };
      await act(async () => {
        if (action === 'complete') await result.current.complete.mutateAsync(ref);
        else await result.current.undo.mutateAsync(ref);
      });

      await waitFor(() =>
        keys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(true)),
      );
    },
  );
});
