import {
  activitySchema,
  type Activity,
  type CreateActivityInput,
  type UpdateActivityInput,
} from '@lifexp/shared';
import { z } from 'zod';
import { apiJson } from '../../lib/apiClient';

const activityListSchema = z.array(activitySchema);

export const listActivities = (includeArchived: boolean): Promise<Activity[]> =>
  apiJson(`/activities?includeArchived=${includeArchived}`, activityListSchema);

export const createActivity = (input: CreateActivityInput): Promise<Activity> =>
  apiJson('/activities', activitySchema, { method: 'POST', json: input });

export const updateActivity = (id: string, input: UpdateActivityInput): Promise<Activity> =>
  apiJson(`/activities/${id}`, activitySchema, { method: 'PATCH', json: input });

export const archiveActivity = (id: string): Promise<Activity> =>
  apiJson(`/activities/${id}/archive`, activitySchema, { method: 'POST' });

export const unarchiveActivity = (id: string): Promise<Activity> =>
  apiJson(`/activities/${id}/unarchive`, activitySchema, { method: 'POST' });
