import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GoalStatus, UpdateGoalInput } from '@lifexp/shared';
import { achievementsKey } from '../achievements/useAchievements';
import { progressKey } from '../character/useProgress';
import { rewardsKey } from '../rewards/useRewards';
import { todayKey } from '../today/useToday';
import * as goalsApi from './goalsApi';

export const goalsKey = ['goals'] as const;

export function useGoalList(status?: GoalStatus) {
  return useQuery({
    queryKey: [...goalsKey, 'list', { status: status ?? 'all' }],
    queryFn: () => goalsApi.listGoals(status),
  });
}

export function useGoal(id: string) {
  return useQuery({ queryKey: [...goalsKey, 'detail', id], queryFn: () => goalsApi.getGoal(id) });
}

export function useGoalHistory(id: string) {
  return useQuery({
    queryKey: [...goalsKey, 'history', id],
    queryFn: () => goalsApi.getGoalHistory(id),
  });
}

export function useGoalMutations() {
  const queryClient = useQueryClient();
  // Metas e marcos mexem em XP (HUD, ficha, áreas, "XP do dia"); concluir um bloco vinculado
  // muda as horas investidas, então a chave `goals` inteira é invalidada junto com o progresso.
  const refresh = () =>
    Promise.all(
      [goalsKey, progressKey, todayKey, achievementsKey, rewardsKey].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );

  return {
    create: useMutation({ mutationFn: goalsApi.createGoal, onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: UpdateGoalInput }) =>
        goalsApi.updateGoal(id, input),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: goalsApi.deleteGoal, onSuccess: refresh }),
    setStatus: useMutation({
      mutationFn: ({ id, status }: { id: string; status: GoalStatus }) =>
        goalsApi.setGoalStatus(id, status),
      onSuccess: refresh,
    }),
    addMilestone: useMutation({
      mutationFn: ({ goalId, title }: { goalId: string; title: string }) =>
        goalsApi.addMilestone(goalId, title),
      onSuccess: refresh,
    }),
    renameMilestone: useMutation({
      mutationFn: ({
        goalId,
        milestoneId,
        title,
      }: {
        goalId: string;
        milestoneId: string;
        title: string;
      }) => goalsApi.renameMilestone(goalId, milestoneId, title),
      onSuccess: refresh,
    }),
    removeMilestone: useMutation({
      mutationFn: ({ goalId, milestoneId }: { goalId: string; milestoneId: string }) =>
        goalsApi.removeMilestone(goalId, milestoneId),
      onSuccess: refresh,
    }),
    completeMilestone: useMutation({
      mutationFn: ({ goalId, milestoneId }: { goalId: string; milestoneId: string }) =>
        goalsApi.completeMilestone(goalId, milestoneId),
      onSuccess: refresh,
    }),
    undoMilestone: useMutation({
      mutationFn: ({ goalId, milestoneId }: { goalId: string; milestoneId: string }) =>
        goalsApi.undoMilestone(goalId, milestoneId),
      onSuccess: refresh,
    }),
  };
}
