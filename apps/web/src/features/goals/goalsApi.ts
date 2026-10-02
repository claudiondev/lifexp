import {
  goalActionResultSchema,
  goalHistoryItemSchema,
  goalSchema,
  type CreateGoalInput,
  type Goal,
  type GoalActionResult,
  type GoalHistoryItem,
  type GoalStatus,
  type UpdateGoalInput,
} from '@lifexp/shared';
import { z } from 'zod';
import { apiFetch, apiJson } from '../../lib/apiClient';

const goalListSchema = z.array(goalSchema);
const historySchema = z.array(goalHistoryItemSchema);

export const listGoals = (status?: GoalStatus): Promise<Goal[]> =>
  apiJson(status ? `/goals?status=${status}` : '/goals', goalListSchema);

export const getGoal = (id: string): Promise<Goal> => apiJson(`/goals/${id}`, goalSchema);

export const getGoalHistory = (id: string): Promise<GoalHistoryItem[]> =>
  apiJson(`/goals/${id}/history`, historySchema);

export const createGoal = (input: CreateGoalInput): Promise<Goal> =>
  apiJson('/goals', goalSchema, { method: 'POST', json: input });

export const updateGoal = (id: string, input: UpdateGoalInput): Promise<Goal> =>
  apiJson(`/goals/${id}`, goalSchema, { method: 'PATCH', json: input });

/** Idempotente. O XP que a meta e os marcos renderam volta (estornos). */
export async function deleteGoal(id: string): Promise<void> {
  await apiFetch(`/goals/${id}`, { method: 'DELETE' });
}

export const setGoalStatus = (id: string, status: GoalStatus): Promise<GoalActionResult> =>
  apiJson(`/goals/${id}/status`, goalActionResultSchema, { method: 'PUT', json: { status } });

export const addMilestone = (goalId: string, title: string): Promise<Goal> =>
  apiJson(`/goals/${goalId}/milestones`, goalSchema, { method: 'POST', json: { title } });

export const renameMilestone = (
  goalId: string,
  milestoneId: string,
  title: string,
): Promise<Goal> =>
  apiJson(`/goals/${goalId}/milestones/${milestoneId}`, goalSchema, {
    method: 'PATCH',
    json: { title },
  });

export const removeMilestone = (goalId: string, milestoneId: string): Promise<Goal> =>
  apiJson(`/goals/${goalId}/milestones/${milestoneId}`, goalSchema, { method: 'DELETE' });

export const completeMilestone = (goalId: string, milestoneId: string): Promise<GoalActionResult> =>
  apiJson(`/goals/${goalId}/milestones/${milestoneId}/completion`, goalActionResultSchema, {
    method: 'POST',
  });

export const undoMilestone = (goalId: string, milestoneId: string): Promise<GoalActionResult> =>
  apiJson(`/goals/${goalId}/milestones/${milestoneId}/completion`, goalActionResultSchema, {
    method: 'DELETE',
  });
