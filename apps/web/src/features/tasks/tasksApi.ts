import {
  taskCompletionResultSchema,
  taskListSchema,
  taskSchema,
  taskUndoResultSchema,
  type CreateTaskInput,
  type CreateTaskItemInput,
  type Task,
  type TaskCompletionResult,
  type TaskList,
  type TaskUndoResult,
  type UpdateTaskInput,
  type UpdateTaskItemInput,
} from '@lifexp/shared';
import { apiFetch, apiJson } from '../../lib/apiClient';

export type TaskScope = 'today' | 'inbox';

export const listTasks = (scope: TaskScope): Promise<TaskList> =>
  apiJson(`/tasks?scope=${scope}`, taskListSchema);

export const createTask = (input: CreateTaskInput): Promise<Task> =>
  apiJson('/tasks', taskSchema, { method: 'POST', json: input });

export const updateTask = (id: string, input: UpdateTaskInput): Promise<Task> =>
  apiJson(`/tasks/${id}`, taskSchema, { method: 'PATCH', json: input });

/** Arquiva (nunca exclui); repetir não é erro. */
export async function archiveTask(id: string): Promise<void> {
  await apiFetch(`/tasks/${id}`, { method: 'DELETE' });
}

/** Concluir é idempotente: repetir devolve o estado atual, sem XP novo. */
export const completeTask = (id: string): Promise<TaskCompletionResult> =>
  apiJson(`/tasks/${id}/complete`, taskCompletionResultSchema, { method: 'POST' });

export const undoTask = (id: string): Promise<TaskUndoResult> =>
  apiJson(`/tasks/${id}/complete`, taskUndoResultSchema, { method: 'DELETE' });

export const addTaskItem = (id: string, input: CreateTaskItemInput): Promise<Task> =>
  apiJson(`/tasks/${id}/items`, taskSchema, { method: 'POST', json: input });

export const updateTaskItem = (
  id: string,
  itemId: string,
  input: UpdateTaskItemInput,
): Promise<Task> =>
  apiJson(`/tasks/${id}/items/${itemId}`, taskSchema, { method: 'PATCH', json: input });

export const removeTaskItem = (id: string, itemId: string): Promise<Task> =>
  apiJson(`/tasks/${id}/items/${itemId}`, taskSchema, { method: 'DELETE' });
