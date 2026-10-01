import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { authResponseSchema } from '@lifexp/shared';
import { DEFAULT_AREAS } from '../src/areas/domain/default-areas.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  createTestApp,
  refreshCookieHeader,
  refreshSetCookie,
  uniqueEmail,
  VALID_PASSWORD,
} from './helpers.js';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const server = () => app.getHttpServer();

  const register = (email = uniqueEmail()) =>
    request(server())
      .post('/api/auth/register')
      .send({ name: 'Ana', email, password: VALID_PASSWORD });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('cria a conta, abre a sessão e não vaza o hash da senha', async () => {
      const res = await register();

      expect(res.status).toBe(201);
      expect(authResponseSchema.safeParse(res.body).success).toBe(true);
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
    });

    it('define o cookie de refresh como httpOnly, SameSite=Strict e Path=/api/auth', async () => {
      const cookie = refreshSetCookie(await register());

      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toMatch(/Path=\/api\/auth/i);
    });

    it('guarda a senha com argon2id e o refresh token apenas como hash', async () => {
      const email = uniqueEmail();
      const res = await register(email);
      const token = refreshCookieHeader(res).replace('refresh_token=', '');

      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });

      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(session.refreshTokenHash).not.toBe(token);
      expect(session.refreshTokenHash).toHaveLength(64);
    });

    it('cria as áreas padrão, cada uma com uma atividade de mesmo nome (RF08)', async () => {
      const email = uniqueEmail();
      await register(email);

      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      const areas = await prisma.area.findMany({
        where: { userId: user.id },
        include: { activities: true },
        orderBy: { position: 'asc' },
      });

      expect(areas.map((area) => area.name)).toEqual(DEFAULT_AREAS.map((area) => area.name));
      for (const area of areas) {
        expect(area.archivedAt).toBeNull();
        expect(area.activities).toHaveLength(1);
        expect(area.activities[0]).toMatchObject({
          name: area.name,
          xpWeight: 1,
          userId: user.id,
          areaId: area.id,
        });
      }
    });

    it('cadastro repetido não duplica as áreas da conta existente', async () => {
      const email = uniqueEmail();
      await register(email);

      await register(email);

      // Conta só as áreas desta pessoa: as suítes e2e rodam em paralelo no mesmo banco.
      const areas = await prisma.area.count({ where: { user: { email } } });
      expect(areas).toBe(DEFAULT_AREAS.length);
    });

    it('rejeita e-mail repetido, ignorando maiúsculas, com 409', async () => {
      const email = uniqueEmail();
      await register(email);
      const res = await register(email.toUpperCase());

      expect(res.status).toBe(409);
    });

    it('rejeita payload inválido com 400', async () => {
      const res = await request(server())
        .post('/api/auth/register')
        .send({ name: '', email: 'x', password: '1' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/login', () => {
    it('autentica com credenciais corretas', async () => {
      const email = uniqueEmail();
      await register(email);

      const res = await request(server())
        .post('/api/auth/login')
        .send({ email, password: VALID_PASSWORD });

      expect(res.status).toBe(200);
      expect(authResponseSchema.safeParse(res.body).success).toBe(true);
      expect(refreshSetCookie(res)).toBeDefined();
    });

    it('responde igual para senha errada e e-mail inexistente (RS13)', async () => {
      const email = uniqueEmail();
      await register(email);

      const wrongPassword = await request(server())
        .post('/api/auth/login')
        .send({ email, password: 'senha-errada-123' });
      const unknownEmail = await request(server())
        .post('/api/auth/login')
        .send({ email: uniqueEmail(), password: 'senha-errada-123' });

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(wrongPassword.body).toEqual(unknownEmail.body);
    });
  });

  describe('GET /users/me', () => {
    it('retorna o usuário do token', async () => {
      const email = uniqueEmail();
      const { body } = await register(email);

      const res = await request(server())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${body.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: body.user.id, email });
    });

    it('exige autenticação', async () => {
      expect((await request(server()).get('/api/users/me')).status).toBe(401);
      const bad = await request(server()).get('/api/users/me').set('Authorization', 'Bearer x');
      expect(bad.status).toBe(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotaciona o refresh token e devolve um access token que funciona', async () => {
      const first = await register();
      const oldCookie = refreshCookieHeader(first);

      const res = await request(server()).post('/api/auth/refresh').set('Cookie', oldCookie);

      expect(res.status).toBe(200);
      expect(refreshCookieHeader(res)).not.toBe(oldCookie);
      const me = await request(server())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${res.body.accessToken}`);
      expect(me.status).toBe(200);
    });

    it('exige o cookie', async () => {
      expect((await request(server()).post('/api/auth/refresh')).status).toBe(401);
    });

    it('reuso de token antigo revoga a família inteira (RS04)', async () => {
      const first = await register();
      const oldCookie = refreshCookieHeader(first);
      const rotated = await request(server()).post('/api/auth/refresh').set('Cookie', oldCookie);
      const newCookie = refreshCookieHeader(rotated);

      const reuse = await request(server()).post('/api/auth/refresh').set('Cookie', oldCookie);
      const afterReuse = await request(server()).post('/api/auth/refresh').set('Cookie', newCookie);

      expect(reuse.status).toBe(401);
      expect(afterReuse.status).toBe(401);
    });

    it('rejeita sessão expirada', async () => {
      const email = uniqueEmail();
      const cookie = refreshCookieHeader(await register(email));
      await prisma.session.updateMany({
        where: { user: { email } },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const res = await request(server()).post('/api/auth/refresh').set('Cookie', cookie);

      expect(res.status).toBe(401);
    });

    it('dois refreshes simultâneos com o mesmo token: no máximo um vence', async () => {
      const cookie = refreshCookieHeader(await register());

      const results = await Promise.all([
        request(server()).post('/api/auth/refresh').set('Cookie', cookie),
        request(server()).post('/api/auth/refresh').set('Cookie', cookie),
      ]);

      expect(results.filter((r) => r.status === 200).length).toBeLessThanOrEqual(1);
    });
  });

  describe('POST /auth/logout', () => {
    it('revoga a sessão e limpa o cookie', async () => {
      const cookie = refreshCookieHeader(await register());

      const res = await request(server()).post('/api/auth/logout').set('Cookie', cookie);
      const refreshAfter = await request(server()).post('/api/auth/refresh').set('Cookie', cookie);

      expect(res.status).toBe(204);
      expect(refreshSetCookie(res)).toMatch(/refresh_token=;/);
      expect(refreshAfter.status).toBe(401);
    });

    it('é idempotente, mesmo sem cookie', async () => {
      expect((await request(server()).post('/api/auth/logout')).status).toBe(204);
    });
  });
});
