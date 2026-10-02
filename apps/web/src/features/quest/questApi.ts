import { questSchema, type Quest } from '@lifexp/shared';
import { apiJson } from '../../lib/apiClient';

export const getQuest = (): Promise<Quest> => apiJson('/quest', questSchema);
