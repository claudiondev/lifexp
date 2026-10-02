import { ServiceUnavailableException } from '@nestjs/common';
import { healthResponseSchema, jobsHealthSchema } from '@lifexp/shared';
import { JobMonitor } from '../observability/job-monitor.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { HealthService } from './health.service.js';

const prismaOk = { $queryRaw: async () => [{ '?column?': 1 }] } as unknown as PrismaService;
const build = (prisma: PrismaService = prismaOk, monitor = new JobMonitor()) =>
  new HealthService(monitor, prisma);

describe('HealthService', () => {
  it('retorna status ok com timestamp ISO válido', () => {
    const result = build().check();
    expect(healthResponseSchema.safeParse(result).success).toBe(true);
    expect(result.status).toBe('ok');
  });

  it('o estado dos jobs vem do monitor: ok sem execuções, degradado com falhas seguidas', async () => {
    const monitor = new JobMonitor();
    const service = build(prismaOk, monitor);
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

  describe('ready (prontidão para receber tráfego)', () => {
    it('com o banco respondendo, está pronta', async () => {
      const result = await build().ready();
      expect(healthResponseSchema.safeParse(result).success).toBe(true);
      expect(result.status).toBe('ok');
    });

    it('com o banco fora, responde 503 com status "error" e sem o motivo', async () => {
      const prisma = {
        $queryRaw: async () => {
          throw new Error('connect ECONNREFUSED 10.0.0.5:5432 senha=abc');
        },
      } as unknown as PrismaService;

      const failure = await build(prisma)
        .ready()
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ServiceUnavailableException);
      const body = (failure as ServiceUnavailableException).getResponse();
      expect(body).toMatchObject({ status: 'error' });
      expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED|10\.0\.0\.5|senha/);
    });

    it('com o banco travado, desiste no prazo em vez de ficar pendurada', async () => {
      const prisma = { $queryRaw: () => new Promise(() => undefined) } as unknown as PrismaService;
      const started = Date.now();

      const failure = await build(prisma)
        .ready(50)
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ServiceUnavailableException);
      expect(Date.now() - started).toBeLessThan(1000);
    });
  });
});
