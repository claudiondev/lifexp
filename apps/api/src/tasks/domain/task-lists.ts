import type { CivilDate, TaskPriority } from '@lifexp/shared';

/** O que as regras de lista precisam saber de uma tarefa (só dados, sem Prisma). */
export interface TaskFacts {
  dueDate: CivilDate | null;
  priority: TaskPriority;
  archived: boolean;
  /** Dia LOCAL (no fuso da pessoa) em que foi concluída; nulo = em aberto. */
  completedOn: CivilDate | null;
  /** Instante da conclusão, em ms (para ordenar as concluídas). */
  completedAtMs: number | null;
  createdAtMs: number;
}

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

const isOpen = (task: TaskFacts) => task.completedOn === null;

/**
 * "Vinda de": o dia original de uma tarefa em aberto que ficou para trás. É derivado de hoje (nada é gravado) e não
 * tem penalidade: a tarefa só continua aparecendo até ser feita, movida ou arquivada.
 */
export function carriedFrom(task: TaskFacts, today: CivilDate): CivilDate | null {
  return isOpen(task) && task.dueDate !== null && task.dueDate < today ? task.dueDate : null;
}

/**
 * Entra na lista de Hoje: em aberto com dia até hoje (as atrasadas "passam para o dia seguinte sozinhas"), ou concluída
 * hoje (para a pessoa ver o que já fez). Arquivada nunca entra; tarefa de dia futuro também não.
 */
export function belongsToToday(task: TaskFacts, today: CivilDate): boolean {
  if (task.archived) return false;
  if (isOpen(task)) return task.dueDate !== null && task.dueDate <= today;
  return task.completedOn === today;
}

/** Caixa de entrada (Pendentes): em aberto e sem dia. */
export function belongsToInbox(task: TaskFacts): boolean {
  return !task.archived && isOpen(task) && task.dueDate === null;
}

/**
 * Ordem da lista: em aberto antes das concluídas. Entre as em aberto, as mais antigas (vindas de dias anteriores)
 * primeiro, depois prioridade (alta antes) e, por fim, a ordem de criação. Concluídas: a mais recente primeiro.
 */
export function compareTasks(a: TaskFacts, b: TaskFacts): number {
  const aOpen = isOpen(a);
  if (aOpen !== isOpen(b)) return aOpen ? -1 : 1;
  if (!aOpen)
    return (b.completedAtMs ?? 0) - (a.completedAtMs ?? 0) || a.createdAtMs - b.createdAtMs;
  const byDay = (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31');
  return (
    byDay || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.createdAtMs - b.createdAtMs
  );
}

export const sortTasks = <T extends TaskFacts>(tasks: readonly T[]): T[] =>
  [...tasks].sort(compareTasks);
