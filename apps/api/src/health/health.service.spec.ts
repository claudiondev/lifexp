import { healthResponseSchema } from '@lifexp/shared';
import { HealthService } from './health.service.js';

describe('HealthService', () => {
  it('retorna status ok com timestamp ISO válido', () => {
    const result = new HealthService().check();
    expect(healthResponseSchema.safeParse(result).success).toBe(true);
    expect(result.status).toBe('ok');
  });
});
