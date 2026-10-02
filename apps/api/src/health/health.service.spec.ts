import { healthResponseSchema, jobsHealthSchema } from '@lifexp/shared';
import { JobMonitor } from '../observability/job-monitor.js';
import { HealthService } from './health.service.js';

describe('HealthService', () => {
  it('retorna status ok com timestamp ISO válido', () => {
    const result = new HealthService(new JobMonitor()).check();
    expect(healthResponseSchema.safeParse(result).success).toBe(true);
    expect(result.status).toBe('ok');
  });

  it('o estado dos jobs vem do monitor: ok sem execuções, degradado com falhas seguidas', async () => {
    const monitor = new JobMonitor();
    const service = new HealthService(monitor);
    expect(service.jobs()).toEqual({ status: 'ok', jobs: [] });

    for (let i = 0; i < 3; i++) {
      await monitor.track('varredura', async () => {
        throw new Error('x');
      });
    }
    const jobs = service.jobs();
    expect(jobsHealthSchema.safeParse(jobs).success).toBe(true);
    expect(jobs.status).toBe('degraded');
    expect(jobs.jobs[0]).toMatchObject({ name: 'varredura', consecutiveFailures: 3 });
  });
});
