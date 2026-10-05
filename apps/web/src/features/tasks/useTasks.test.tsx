import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/lib/apiClient';
import { progressKey } from '../character/useProgress';
import { blocksKey } from '../blocks/useWeek';
import { todayKey } from '../today/useToday';
import { setupFakeTasks, makeTask, itemId } from './testing';
import { tasksKey, useTaskMutations } from './useTasks';

const setup = () => {
  const task = makeTask({
    priority: 'high',
    items: [{ id: itemId(1), title: 'a', done: false, doneAt: null, position: 0 }],
  });
  setupFakeTasks({ tasks: [task] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const watched = {
    tasks: [...tasksKey, 'today'],
    progress: progressKey,
    today: todayKey,
    // não pertence às tarefas: concluir tarefa não mexe em blocos, quest nem radar
    blocks: [...blocksKey, 'week', '2026-10-05'],
  } as const;
  for (const key of Object.values(watched)) client.setQueryData(key, { stale: false });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useTaskMutations(), { wrapper });
  const invalidated = (key: readonly unknown[]) =>
    client.getQueryState(key)?.isInvalidated === true;
  return { task, result, invalidated, watched };
};

describe('useTaskMutations', () => {
  beforeEach(() => setAccessToken('token'));
  afterEach(() => vi.unstubAllGlobals());

  it.each(['complete', 'undo'] as const)(
    '%s invalida as listas, o progresso (XP e histórico) e a lista de hoje, mas não os blocos',
    async (action) => {
      const { task, result, invalidated, watched } = setup();

      await act(async () => {
        if (action === 'complete') await result.current.complete.mutateAsync(task.id);
        else await result.current.undo.mutateAsync(task.id);
      });

      await waitFor(() => expect(invalidated(watched.tasks)).toBe(true));
      expect(invalidated(watched.progress)).toBe(true);
      expect(invalidated(watched.today)).toBe(true);
      expect(invalidated(watched.blocks)).toBe(false);
    },
  );

  it.each(['create', 'update', 'archive', 'addItem', 'updateItem', 'removeItem'] as const)(
    '%s só recarrega as listas de tarefas (não mexe em XP)',
    async (action) => {
      const { task, result, invalidated, watched } = setup();

      await act(async () => {
        if (action === 'create')
          await result.current.create.mutateAsync({ title: 'x', priority: 'medium' });
        if (action === 'update')
          await result.current.update.mutateAsync({ id: task.id, input: { title: 'y' } });
        if (action === 'archive') await result.current.archive.mutateAsync(task.id);
        if (action === 'addItem')
          await result.current.addItem.mutateAsync({ id: task.id, title: 'p' });
        if (action === 'updateItem')
          await result.current.updateItem.mutateAsync({
            id: task.id,
            itemId: itemId(1),
            input: { done: true },
          });
        if (action === 'removeItem')
          await result.current.removeItem.mutateAsync({ id: task.id, itemId: itemId(1) });
      });

      await waitFor(() => expect(invalidated(watched.tasks)).toBe(true));
      expect(invalidated(watched.progress)).toBe(false);
      expect(invalidated(watched.today)).toBe(false);
    },
  );
});
