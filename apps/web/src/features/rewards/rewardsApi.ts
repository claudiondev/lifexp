import {
  rewardSchema,
  type CreateRewardInput,
  type Reward,
  type UpdateRewardInput,
} from '@lifexp/shared';
import { z } from 'zod';
import { apiFetch, apiJson } from '../../lib/apiClient';

const rewardListSchema = z.array(rewardSchema);

export const listRewards = (): Promise<Reward[]> => apiJson('/rewards', rewardListSchema);

export const createReward = (input: CreateRewardInput): Promise<Reward> =>
  apiJson('/rewards', rewardSchema, { method: 'POST', json: input });

export const updateReward = (id: string, input: UpdateRewardInput): Promise<Reward> =>
  apiJson(`/rewards/${id}`, rewardSchema, { method: 'PATCH', json: input });

export const redeemReward = (id: string): Promise<Reward> =>
  apiJson(`/rewards/${id}/redeem`, rewardSchema, { method: 'POST' });

export async function deleteReward(id: string): Promise<void> {
  await apiFetch(`/rewards/${id}`, { method: 'DELETE' });
}
