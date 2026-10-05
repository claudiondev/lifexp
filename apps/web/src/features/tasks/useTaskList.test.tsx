import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/lib/apiClient';
import { makeTask, setupFakeTasks } from './testing';
import { useTaskList } from './useTasks';

const wrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};

describe('useTaskList', () => {
  beforeEach(() => setAccessToken('token'));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('Hoje é buscada de novo a cada minuto (a "vinda de ontem" aparece na virada do dia)', async () => {
    const { calls } = setupFakeTasks({ tasks: [makeTask()] });
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    renderHook(() => useTaskList('today'), { wrapper: wrapper() });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it('Pendentes não recarrega sozinha', async () => {
    const { calls } = setupFakeTasks({ tasks: [makeTask({ dueDate: null })] });
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    renderHook(() => useTaskList('inbox'), { wrapper: wrapper() });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(180_000);

    expect(calls).toHaveLength(1);
  });

  it('enabled=false não consulta', async () => {
    const { calls } = setupFakeTasks({ tasks: [] });
    renderHook(() => useTaskList('today', false), { wrapper: wrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toHaveLength(0);
  });
});
