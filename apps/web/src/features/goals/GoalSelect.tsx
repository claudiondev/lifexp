import type { Goal } from '@lifexp/shared';
import { forwardRef, type SelectHTMLAttributes } from 'react';
import { Select } from '@/components/ui/select';
import { useGoalList } from './useGoals';

/** Metas que ainda aceitam blocos novos (a API recusa as concluídas e as abandonadas). */
export const linkableGoals = (goals: Goal[], currentGoalId: string | null): Goal[] =>
  goals.filter(
    (goal) => goal.status === 'active' || goal.status === 'paused' || goal.id === currentGoalId,
  );

interface GoalSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** A meta que o bloco já tem: continua na lista mesmo que a meta tenha sido concluída depois. */
  currentGoalId?: string | null;
}

/**
 * Escolha da meta a que o bloco serve (RF19). Só aparece quando há metas para escolher: sem
 * nenhuma, o campo seria ruído.
 */
export const GoalSelect = forwardRef<HTMLSelectElement, GoalSelectProps>(function GoalSelect(
  { currentGoalId = null, ...props },
  ref,
) {
  const goals = useGoalList();
  const options = linkableGoals(goals.data ?? [], currentGoalId);
  if (options.length === 0) return null;

  return (
    <Select ref={ref} {...props}>
      <option value="">Sem meta</option>
      {options.map((goal) => (
        <option key={goal.id} value={goal.id}>
          {goal.title}
        </option>
      ))}
    </Select>
  );
});
