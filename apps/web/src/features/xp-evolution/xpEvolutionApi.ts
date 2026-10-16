import { xpEvolutionSchema, type XpEvolution } from '@lifexp/shared';
import { apiJson } from '../../lib/apiClient';

export function getXpEvolution(weeks: number): Promise<XpEvolution> {
  return apiJson(`/xp/evolution?weeks=${weeks}`, xpEvolutionSchema);
}
