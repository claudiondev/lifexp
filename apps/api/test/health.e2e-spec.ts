import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { healthResponseSchema, jobsHealthSchema } from '@lifexp/shared';
import { JobMonitor } from '../src/observability/job-monitor.js';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/setup-app.js';

describe('GET /api/health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responde 200 com o contrato do schema compartilhado', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(healthResponseSchema.safeParse(res.body).success).toBe(true);
  });

  describe('GET /api/health/ready', () => {
    it('é público e responde 200 com o banco no ar', async () => {
      const res = await request(app.getHttpServer()).get('/api/health/ready').expect(200);
      expect(healthResponseSchema.parse(res.body).status).toBe('ok');
    });
  });

  describe('GET /api/health/jobs (RNF13)', () => {
    it('é público e devolve o contrato: ok e sem jobs quando nada rodou', async () => {
      const res = await request(app.getHttpServer()).get('/api/health/jobs').expect(200);
      expect(jobsHealthSchema.safeParse(res.body).success).toBe(true);
    });

    it('mostra o estado de cada job e fica "degraded" com falhas seguidas, sem vazar o erro', async () => {
      const monitor = app.get(JobMonitor);
      await monitor.track('job-bom-e2e', async () => ({ n: 1 }));
      for (let i = 0; i < 3; i++) {
        await monitor.track('job-ruim-e2e', async () => {
          throw new Error('segredo: ana@exemplo.com token=abc123');
        });
      }

      const res = await request(app.getHttpServer()).get('/api/health/jobs').expect(200);
      expect(jobsHealthSchema.parse(res.body).status).toBe('degraded');
      const byName = Object.fromEntries(
        (res.body.jobs as { name: string }[]).map((job) => [job.name, job]),
      );
      expect(byName['job-bom-e2e']).toMatchObject({ lastStatus: 'ok', consecutiveFailures: 0 });
      expect(byName['job-ruim-e2e']).toMatchObject({
        lastStatus: 'failed',
        consecutiveFailures: 3,
      });
      // só nomes, instantes e contagens: nada do texto do erro
      expect(JSON.stringify(res.body)).not.toMatch(/segredo|ana@|abc123/);
    });
  });

  it('expõe o Swagger em /api/docs', async () => {
    await request(app.getHttpServer()).get('/api/docs').expect(200);
  });
});
