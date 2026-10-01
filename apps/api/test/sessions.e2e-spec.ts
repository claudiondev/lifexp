import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, refreshCookieHeader, uniqueEmail, VALID_PASSWORD } from './helpers.js';

describe('Sessões e cadastro (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  const register = (email: string, userAgent?: string) => {
    const req = request(server())
      .post('/api/auth/register')
      .send({ name: 'Ana', email, password: VALID_PASSWORD });
    return userAgent ? req.set('User-Agent', userAgent) : req;
  };
  const login = (email: string) =>
    request(server()).post('/api/auth/login').send({ email, password: VALID_PASSWORD });
  const refresh = (cookie: string) =>
    request(server()).post('/api/auth/refresh').set('Cookie', cookie);

  describe('vários dispositivos (RS04)', () => {
    it('sair em um dispositivo não encerra a sessão dos outros', async () => {
      const email = uniqueEmail();
      await register(email);
      const phone = refreshCookieHeader(await login(email));
      const laptop = refreshCookieHeader(await login(email));

      await request(server()).post('/api/auth/logout').set('Cookie', phone);

      expect((await refresh(phone)).status).toBe(401);
      expect((await refresh(laptop)).status).toBe(200);
    });

    it('detectar reuso numa sessão não derruba as outras sessões da mesma pessoa', async () => {
      const email = uniqueEmail();
      await register(email);
      const phoneOld = refreshCookieHeader(await login(email));
      const laptop = refreshCookieHeader(await login(email));
      await refresh(phoneOld); // rotaciona; phoneOld agora está revogado

      const reuse = await refresh(phoneOld); // reuso: derruba só a família do celular

      expect(reuse.status).toBe(401);
      expect((await refresh(laptop)).status).toBe(200);
    });

    it('token desconhecido ou adulterado é rejeitado', async () => {
      expect((await refresh('refresh_token=nao-existe')).status).toBe(401);
      expect((await refresh('refresh_token=')).status).toBe(401);
    });
  });

  describe('registro de dispositivo (RS17)', () => {
    it('grava o User-Agent da sessão, limitado a 255 caracteres', async () => {
      const email = uniqueEmail();
      await register(email, 'LifeXP-Teste/1.0');
      const long = 'x'.repeat(400);
      await login(email).set('User-Agent', long);

      const sessions = await prisma.session.findMany({
        where: { user: { email } },
        orderBy: { createdAt: 'asc' },
      });

      expect(sessions[0]?.userAgent).toBe('LifeXP-Teste/1.0');
      expect(sessions[1]?.userAgent).toHaveLength(255);
    });
  });

  describe('login', () => {
    it('aceita o e-mail em maiúsculas e com espaços (normalizado)', async () => {
      const email = uniqueEmail();
      await register(email);
      const res = await request(server())
        .post('/api/auth/login')
        .send({ email: `  ${email.toUpperCase()} `, password: VALID_PASSWORD });
      expect(res.status).toBe(200);
    });
  });

  describe('cadastro simultâneo (RS18)', () => {
    it('com o mesmo e-mail, só um vence e o outro recebe 409, nunca 500', async () => {
      const email = uniqueEmail();

      const results = await Promise.all([register(email), register(email), register(email)]);
      const statuses = results.map((res) => res.status).sort();

      expect(statuses).toEqual([201, 409, 409]);
      expect(await prisma.user.count({ where: { email } })).toBe(1);
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(await prisma.area.count({ where: { userId: user.id } })).toBe(7);
    });
  });
});
