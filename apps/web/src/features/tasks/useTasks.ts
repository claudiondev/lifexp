import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateTaskInput, UpdateTaskItemInput } from '@lifexp/shared';
import { progressKey } from '../character/useProgress';
import { todayKey } from '../today/useToday';
import * as tasksApi from './tasksApi';
import type { TaskScope } from './tasksApi';

export const tasksKey = ['tasks'] as const;

/**
 * Hoje e Pendentes. A lista de Hoje é buscada de novo a cada minuto: quando o dia vira, a tarefa que ficou em aberto
 * passa a "vinda de ontem" sem recarregar a página (é derivado no servidor, nada é gravado na virada).
 */
export function useTaskList(scope: TaskScope, enabled = true) {
  return useQuery({
    queryKey: [...tasksKey, scope],
    queryFn: () => tasksApi.listTasks(scope),
    enabled,
    refetchInterval: scope === 'today' ? 60_000 : false,
  });
}

export function useTaskMutations() {
  const queryClient = useQueryClient();
  // Tarefas mexem em XP (HUD, ficha, áreas, "XP do dia" e histórico, que mora dentro de `progressKey`).
  const refresh = () =>
    Promise.all(
      [tasksKey, progressKey, todayKey].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
  // Editar, arquivar e mexer em passos não mexem em XP: só as listas.
  const refreshLists = () => queryClient.invalidateQueries({ queryKey: tasksKey });

  return {
    create: useMutation({ mutationFn: tasksApi.createTask, onSuccess: refreshLists }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: UpdateTaskInput }) =>
        tasksApi.updateTask(id, input),
      onSuccess: refreshLists,
    }),
    archive: useMutation({ mutationFn: tasksApi.archiveTask, onSuccess: refreshLists }),
    complete: useMutation({ mutationFn: tasksApi.completeTask, onSuccess: refresh }),
    undo: useMutation({ mutationFn: tasksApi.undoTask, onSuccess: refresh }),
    addItem: useMutation({
      mutationFn: ({ id, title }: { id: string; title: string }) =>
        tasksApi.addTaskItem(id, { title }),
      onSuccess: refreshLists,
    }),
    updateItem: useMutation({
      mutationFn: ({
        id,
        itemId,
        input,
      }: {
        id: string;
        itemId: string;
        input: UpdateTaskItemInput;
      }) => tasksApi.updateTaskItem(id, itemId, input),
      onSuccess: refreshLists,
    }),
    removeItem: useMutation({
      mutationFn: ({ id, itemId }: { id: string; itemId: string }) =>
        tasksApi.removeTaskItem(id, itemId),
      onSuccess: refreshLists,
    }),
  };
}
