import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { TestUser } from './helpers.js';

const PASSWORD = 'senha-de-teste-123';

describe('Rate limit de exportar e excluir a conta (e2e, RS08)', () => {
  let app: INestApplication;
  let user: TestUser;

  beforeAll(async () => {
    // O limite é lido quando o AppModule é importado: define-se antes (cada arquivo e2e tem processo próprio).
    process.env['AUTH_RATE_LIMIT_PER_MINUTE'] = '3';
    const helpers = await import('./helpers.js');
    app = await helpers.createTestApp();
    user = await helpers.registerUser(app);
  });
  afterAll(async () => {
    await app.close();
  });

  const as = () => ({ Authorization: `Bearer ${user.accessToken}` });

  it('exportar: bloqueia com 429 depois do limite por minuto', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      statuses.push(
        (await request(app.getHttpServer()).get('/api/users/me/export').set(as())).status,
      );
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
  });

  it('excluir: bloqueia com 429 depois do limite, então ninguém adivinha a senha por aqui', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      statuses.push(
        (
          await request(app.getHttpServer())
            .post('/api/users/me/delete')
            .set(as())
            .send({ password: `errada-${i}-${PASSWORD}` })
        ).status,
      );
    }
    expect(statuses).toEqual([403, 403, 403, 429]);
    // a conta continua de pé
    expect((await request(app.getHttpServer()).get('/api/users/me').set(as())).status).toBe(200);
  });
});
