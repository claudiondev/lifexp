import { taskXp, todayIn, type CivilDate, type Task, type TaskPriority } from '@lifexp/shared';
import type {
  Task as TaskEntity,
  TaskItem as TaskItemEntity,
  TaskPriority as PriorityEntity,
} from '../generated/prisma/client.js';
import { toCivil } from '../blocks/blocks.mapper.js';
import { carriedFrom, type TaskFacts } from './domain/task-lists.js';

export type TaskWithItems = TaskEntity & { items: TaskItemEntity[] };

const toPriority = (priority: PriorityEntity): TaskPriority =>
  priority.toLowerCase() as TaskPriority;
export const fromPriority = (priority: TaskPriority): PriorityEntity =>
  priority.toUpperCase() as PriorityEntity;

/** Os fatos que as regras de lista precisam, com o dia de conclusão no fuso da pessoa. */
export function toTaskFacts(task: TaskEntity, timezone: string): TaskFacts {
  return {
    dueDate: task.dueDate ? toCivil(task.dueDate) : null,
    priority: toPriority(task.priority),
    archived: task.archivedAt !== null,
    completedOn: task.completedAt ? todayIn(timezone, task.completedAt) : null,
    completedAtMs: task.completedAt ? task.completedAt.getTime() : null,
    createdAtMs: task.createdAt.getTime(),
  };
}

export function toTaskDto(task: TaskWithItems, timezone: string, today: CivilDate): Task {
  const facts = toTaskFacts(task, timezone);
  return {
    id: task.id,
    title: task.title,
    note: task.note,
    dueDate: facts.dueDate,
    priority: facts.priority,
    areaId: task.areaId,
    goalId: task.goalId,
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
    xpAwarded: task.xpAwarded,
    xpPreview: taskXp(facts.priority),
    carriedFrom: carriedFrom(facts, today),
    items: [...task.items]
      .sort((a, b) => a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime())
      .map((item) => ({
        id: item.id,
        title: item.title,
        done: item.doneAt !== null,
        doneAt: item.doneAt ? item.doneAt.toISOString() : null,
        position: item.position,
      })),
  };
}
