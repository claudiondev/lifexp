import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/lib/apiClient';
import { achievementsKey } from '../achievements/useAchievements';
import { progressKey } from '../character/useProgress';
import { rewardsKey } from '../rewards/useRewards';
import { todayKey } from '../today/useToday';
import { GOAL_ID, MS_2, json, makeGoal, makeResult } from './testing';
import { goalsKey, useGoalMutations } from './useGoals';

describe('useGoalMutations', () => {
  beforeEach(() => setAccessToken('token'));
  afterEach(() => vi.unstubAllGlobals());

  it('concluir a meta ou um marco invalida XP, hoje, conquistas e recompensas', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => json(200, makeResult(makeGoal(), 100))),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const keys = [goalsKey, progressKey, todayKey, achievementsKey, rewardsKey] as const;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    for (const action of ['milestone', 'status'] as const) {
      keys.forEach((key) => client.setQueryData(key, { stale: false }));
      const { result } = renderHook(() => useGoalMutations(), { wrapper });
      await act(async () => {
        if (action === 'milestone') {
          await result.current.completeMilestone.mutateAsync({
            goalId: GOAL_ID,
            milestoneId: MS_2,
          });
        } else {
          await result.current.setStatus.mutateAsync({ id: GOAL_ID, status: 'completed' });
        }
      });
      await waitFor(() =>
        keys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(true)),
      );
    }
  });
});
