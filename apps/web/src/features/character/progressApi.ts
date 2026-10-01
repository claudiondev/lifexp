import { progressSchema, type Progress } from '@lifexp/shared';
import { apiJson } from '../../lib/apiClient';

export const getProgress = (): Promise<Progress> => apiJson('/progress', progressSchema);
