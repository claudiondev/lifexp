import { z } from 'zod';
import { areaProgressSchema, levelProgressSchema } from './completion.schema.js';
import { blockNoteSchema, civilDateSchema } from './primitives.js';

export const TASK_TITLE_MAX = 120;
export const TASK_NOTE_MAX = 500;
/** Passos de checklist por tarefa. */
export const MAX_TASK_ITEMS = 20;
/** Tarefas em aberto por pessoa: limita o tamanho das listas (Hoje e Pendentes carregam todas as abertas). */
export const MAX_OPEN_TASKS = 500;

export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;
export const taskPrioritySchema = z.enum(TASK_PRIORITIES);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

/** XP fixo por prioridade (Marco 5a): pequeno, para a lista de tarefas não pesar mais que os blocos. */
export const TASK_XP: Record<TaskPriority, number> = { low: 10, medium: 20, high: 40 };
/** Teto diário de XP vindo de tarefas: sem ele, criar tarefinhas viraria uma forma de "farmar" XP. */
export const TASK_DAILY_XP_CAP = 100;

/** XP que a prioridade rende, sem considerar o teto. */
export const taskXp = (priority: TaskPriority): number => TASK_XP[priority];

/**
 * XP que uma conclusão rende de fato: o da prioridade, limitado ao que ainda cabe no teto do dia (`usedToday` é o XP de
 * tarefas já creditado no dia local, sem contar o que foi estornado). Nunca negativo; vale 0 com o teto atingido.
 */
export function creditableTaskXp(priority: TaskPriority, usedToday: number): number {
  const room = Math.max(0, TASK_DAILY_XP_CAP - Math.max(0, usedToday));
  return Math.min(taskXp(priority), room);
}

const titleSchema = z
  .string()
  .trim()
  .min(1, 'Informe o título da tarefa')
  .max(TASK_TITLE_MAX, `O título pode ter no máximo ${TASK_TITLE_MAX} caracteres`);
const itemTitleSchema = z
  .string()
  .trim()
  .min(1, 'Informe o passo')
  .max(TASK_TITLE_MAX, `O passo pode ter no máximo ${TASK_TITLE_MAX} caracteres`);

export const taskItemSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  done: z.boolean(),
  doneAt: z.iso.datetime().nullable(),
  position: z.number().int().min(0),
});

export const taskSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  /** Anotação em texto puro; nulo = sem anotação. */
  note: z.string().nullable(),
  /** Dia em que a tarefa precisa ser feita; nulo = caixa de entrada (Pendentes). */
  dueDate: civilDateSchema.nullable(),
  priority: taskPrioritySchema,
  areaId: z.uuid().nullable(),
  goalId: z.uuid().nullable(),
  completedAt: z.iso.datetime().nullable(),
  /** XP que a conclusão rendeu (0 se ainda aberta ou se o teto diário já tinha sido atingido). */
  xpAwarded: z.number().int().min(0),
  /** XP da prioridade (o botão mostra "+20 XP"); o teto diário pode reduzir o que rende. */
  xpPreview: z.number().int().min(0),
  /**
   * "Vinda de": o dia original de uma tarefa em aberto que ficou para trás. Derivado de hoje, nunca gravado, e sem
   * qualquer penalidade. Nulo quando a tarefa não é de um dia anterior.
   */
  carriedFrom: civilDateSchema.nullable(),
  items: z.array(taskItemSchema),
});

export const TASK_SCOPES = ['today', 'inbox'] as const;
export const listTasksQuerySchema = z.object({ scope: z.enum(TASK_SCOPES).default('today') });

export const taskListSchema = z.object({
  tasks: z.array(taskSchema),
  /** XP de tarefas já creditado hoje (o teto vale por dia local). */
  xpToday: z.number().int().min(0),
  xpCap: z.number().int().min(1),
});

// strictObject: campos desconhecidos viram erro 400 em vez de ignorados (RS07).
export const createTaskSchema = z.strictObject({
  title: titleSchema,
  note: blockNoteSchema.nullish(),
  dueDate: civilDateSchema.nullish(),
  priority: taskPrioritySchema.default('medium'),
  areaId: z.uuid().nullish(),
  goalId: z.uuid().nullish(),
});

/** Todos os campos são opcionais; nulo limpa (anotação, dia, área, meta). Ausente mantém o valor atual. */
export const updateTaskSchema = z
  .strictObject({
    title: titleSchema.optional(),
    note: blockNoteSchema.nullable().optional(),
    dueDate: civilDateSchema.nullable().optional(),
    priority: taskPrioritySchema.optional(),
    areaId: z.uuid().nullable().optional(),
    goalId: z.uuid().nullable().optional(),
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    'Informe ao menos um campo para alterar',
  );

export const createTaskItemSchema = z.strictObject({ title: itemTitleSchema });

export const updateTaskItemSchema = z
  .strictObject({ title: itemTitleSchema.optional(), done: z.boolean().optional() })
  .refine(
    (value) => value.title !== undefined || value.done !== undefined,
    'Informe ao menos um campo para alterar',
  );

export const taskCompletionResultSchema = z.object({
  task: taskSchema,
  /** Verdadeiro quando a tarefa já estava concluída: nada foi ganho de novo. */
  alreadyCompleted: z.boolean(),
  xpAwarded: z.number().int().min(0),
  /** O teto diário de XP de tarefas reduziu (ou zerou) o que esta conclusão rendeu. */
  capped: z.boolean(),
  levelBefore: z.number().int().min(1),
  levelAfter: z.number().int().min(1),
  total: levelProgressSchema,
  area: areaProgressSchema.nullable(),
});

export const taskUndoResultSchema = z.object({
  task: taskSchema,
  /** XP devolvido pelo estorno (positivo). */
  xpReverted: z.number().int().min(0),
  total: levelProgressSchema,
  area: areaProgressSchema.nullable(),
});

export type TaskItem = z.infer<typeof taskItemSchema>;
export type Task = z.infer<typeof taskSchema>;
export type TaskList = z.infer<typeof taskListSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type CreateTaskItemInput = z.infer<typeof createTaskItemSchema>;
export type UpdateTaskItemInput = z.infer<typeof updateTaskItemSchema>;
export type TaskCompletionResult = z.infer<typeof taskCompletionResultSchema>;
export type TaskUndoResult = z.infer<typeof taskUndoResultSchema>;
