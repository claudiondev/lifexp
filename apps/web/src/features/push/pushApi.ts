import {
  pushConfigSchema,
  pushStatusSchema,
  pushTestResultSchema,
  type PushConfig,
  type PushStatus,
  type PushSubscriptionInput,
} from '@lifexp/shared';
import { apiFetch, apiJson } from '../../lib/apiClient';

export const getPushConfig = (): Promise<PushConfig> => apiJson('/push/config', pushConfigSchema);

export const getPushStatus = (): Promise<PushStatus> =>
  apiJson('/push/subscriptions', pushStatusSchema);

export const subscribePush = (input: PushSubscriptionInput): Promise<PushStatus> =>
  apiJson('/push/subscriptions', pushStatusSchema, { method: 'POST', json: input });

export async function unsubscribePush(endpoint: string): Promise<void> {
  await apiFetch('/push/subscriptions', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
}

export const sendPushTest = (): Promise<{ sent: number }> =>
  apiJson('/push/test', pushTestResultSchema, { method: 'POST' });
