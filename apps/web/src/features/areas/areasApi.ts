import { areaSchema, type Area, type CreateAreaInput, type UpdateAreaInput } from '@lifexp/shared';
import { z } from 'zod';
import { apiJson } from '../../lib/apiClient';

const areaListSchema = z.array(areaSchema);

export const listAreas = (includeArchived: boolean): Promise<Area[]> =>
  apiJson(`/areas?includeArchived=${includeArchived}`, areaListSchema);

export const createArea = (input: CreateAreaInput): Promise<Area> =>
  apiJson('/areas', areaSchema, { method: 'POST', json: input });

export const updateArea = (id: string, input: UpdateAreaInput): Promise<Area> =>
  apiJson(`/areas/${id}`, areaSchema, { method: 'PATCH', json: input });

export const archiveArea = (id: string): Promise<Area> =>
  apiJson(`/areas/${id}/archive`, areaSchema, { method: 'POST' });

export const unarchiveArea = (id: string): Promise<Area> =>
  apiJson(`/areas/${id}/unarchive`, areaSchema, { method: 'POST' });
