import { balanceSchema, type Balance } from '@lifexp/shared';
import { apiJson } from '../../lib/apiClient';

export const getBalance = (): Promise<Balance> => apiJson('/balance', balanceSchema);
