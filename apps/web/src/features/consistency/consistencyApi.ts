import { consistencySchema, type Consistency } from '@lifexp/shared';
import { apiJson } from '../../lib/apiClient';

export function getConsistency(weeks: number): Promise<Consistency> {
  return apiJson(`/consistency?weeks=${weeks}`, consistencySchema);
}
