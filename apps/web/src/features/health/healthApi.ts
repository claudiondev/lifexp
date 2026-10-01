import { healthResponseSchema, type HealthResponse } from '@lifexp/shared';

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health');
  if (!response.ok) throw new Error(`API respondeu ${response.status}`);
  // Valida o contrato com o mesmo schema Zod que a API usa (packages/shared).
  return healthResponseSchema.parse(await response.json());
}
