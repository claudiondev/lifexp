import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { healthResponseSchema } from '@lifexp/shared';
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

  it('expõe o Swagger em /api/docs', async () => {
    await request(app.getHttpServer()).get('/api/docs').expect(200);
  });
});
