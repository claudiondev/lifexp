import { xpHistoryPageSchema, type XpEntryType, type XpHistoryPage } from '@lifexp/shared';
import { apiJson } from '../../lib/apiClient';

export const XP_HISTORY_PAGE_SIZE = 20;

export function listXpHistory(type?: XpEntryType, cursor?: string): Promise<XpHistoryPage> {
  const params = new URLSearchParams({ limit: String(XP_HISTORY_PAGE_SIZE) });
  if (type) params.set('type', type);
  if (cursor) params.set('before', cursor);
  return apiJson(`/xp/history?${params.toString()}`, xpHistoryPageSchema);
}
