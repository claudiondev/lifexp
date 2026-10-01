import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

describe('Rate limit de auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // ConfigModule.forRoot() lê o env quando o AppModule é importado, então o limite precisa
    // ser definido antes desse import (por isso o import dinâmico). Cada arquivo e2e roda em
    // processo próprio, então isso não vaza para as outras suítes.
    process.env['AUTH_RATE_LIMIT_PER_MINUTE'] = '3';
    const { createTestApp } = await import('./helpers.js');
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('bloqueia o login com 429 depois do limite por minuto (RS08)', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: `${randomUUID()}@test.dev`, password: 'qualquer-senha' });

    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await attempt()).status);

    expect(statuses).toEqual([401, 401, 401, 429]);
  });
});
