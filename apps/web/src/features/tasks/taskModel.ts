import {
  TASK_DAILY_XP_CAP,
  type Task,
  type TaskCompletionResult,
  type TaskPriority,
} from '@lifexp/shared';
import { longDate } from '@/lib/civilFormat';

export const PRIORITY_OPTIONS: readonly { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Simples' },
  { value: 'medium', label: 'Média' },
  { value: 'high', label: 'Importante' },
];

export const priorityLabel = (priority: TaskPriority): string =>
  PRIORITY_OPTIONS.find((option) => option.value === priority)?.label ?? priority;

/** "vinda de 3 de outubro de 2026"; nada quando a tarefa não ficou para trás. Sempre em tom neutro, sem "atrasada". */
export const carriedText = (task: Pick<Task, 'carriedFrom'>): string | null =>
  task.carriedFrom ? `vinda de ${longDate(task.carriedFrom)}` : null;

/** Passos feitos e total do checklist. */
export const stepProgress = (task: Pick<Task, 'items'>): { done: number; total: number } => ({
  done: task.items.filter((item) => item.done).length,
  total: task.items.length,
});

/** Concluídas e total (a lista de Hoje traz as abertas e as concluídas hoje). */
export function taskCounts(tasks: readonly Pick<Task, 'completedAt'>[]): {
  done: number;
  total: number;
} {
  return { done: tasks.filter((task) => task.completedAt !== null).length, total: tasks.length };
}

export interface Notice {
  title: string;
  description?: string;
}

const CAP_TEXT = `Você chegou ao máximo de XP de tarefas de hoje (${TASK_DAILY_XP_CAP}). Amanhã o limite recomeça.`;

/**
 * O aviso depois de concluir. Sempre positivo: com o teto diário atingido a tarefa conta como feita, só não rende XP, e o
 * texto explica sem soar como erro. Já estava concluída: nada a avisar.
 */
export function completionNotice(result: TaskCompletionResult): Notice | null {
  if (result.alreadyCompleted) return null;
  const name = `“${result.task.title}” feita.`;
  if (result.xpAwarded === 0) {
    return { title: 'Tarefa feita!', description: `${name} ${CAP_TEXT}` };
  }
  return {
    title: `+${result.xpAwarded} XP`,
    description: result.capped ? `${name} ${CAP_TEXT}` : name,
  };
}

/** "40 / 100 XP de tarefas hoje". */
export const xpTodayText = (xpToday: number, xpCap: number): string =>
  `${xpToday} / ${xpCap} XP de tarefas hoje`;
