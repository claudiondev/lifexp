import type { Task, TaskItem } from '@lifexp/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { completionNotice } from './taskModel';
import { useTaskMutations } from './useTasks';

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Algo deu errado. Tente de novo.';

/**
 * As ações de um cartão de tarefa, com o aviso (sempre em tom positivo) e o erro do servidor. Trava só o cartão em que a
 * ação está rodando. `onLevelUp` recebe o novo nível quando concluir uma tarefa faz a pessoa subir.
 */
export function useTaskActions(onLevelUp?: (level: number) => void) {
  const mutations = useTaskMutations();
  const [busyId, setBusyId] = useState<string | null>(null);

  const run = (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    void action()
      .catch((error: unknown) => toast.error(errorText(error)))
      .finally(() => setBusyId(null));
  };

  return {
    busyId,
    complete: (task: Task) =>
      run(task.id, async () => {
        const result = await mutations.complete.mutateAsync(task.id);
        const notice = completionNotice(result);
        if (notice) toast.success(notice.title, { description: notice.description });
        if (result.levelAfter > result.levelBefore) onLevelUp?.(result.levelAfter);
      }),
    undo: (task: Task) =>
      run(task.id, async () => {
        const result = await mutations.undo.mutateAsync(task.id);
        toast.success(`Conclusão de “${task.title}” desfeita`, {
          description: result.xpReverted > 0 ? `${result.xpReverted} XP devolvidos.` : undefined,
        });
      }),
    archive: (task: Task) =>
      run(task.id, async () => {
        await mutations.archive.mutateAsync(task.id);
        toast.success(`“${task.title}” arquivada`);
      }),
    /** Muda o dia da tarefa (por exemplo, de Pendentes para hoje). */
    moveTo: (task: Task, dueDate: string | null, message: string) =>
      run(task.id, async () => {
        await mutations.update.mutateAsync({ id: task.id, input: { dueDate } });
        toast.success(message);
      }),
    addItem: (task: Task, title: string) =>
      run(task.id, async () => {
        await mutations.addItem.mutateAsync({ id: task.id, title });
      }),
    toggleItem: (task: Task, item: TaskItem) =>
      run(task.id, async () => {
        await mutations.updateItem.mutateAsync({
          id: task.id,
          itemId: item.id,
          input: { done: !item.done },
        });
      }),
    removeItem: (task: Task, item: TaskItem) =>
      run(task.id, async () => {
        await mutations.removeItem.mutateAsync({ id: task.id, itemId: item.id });
      }),
  };
}

export type TaskActions = ReturnType<typeof useTaskActions>;
