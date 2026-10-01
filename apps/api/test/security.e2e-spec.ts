import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { bearer, createTestApp, registerUser } from './helpers.js';

const decodePayload = (token: string) =>
  JSON.parse(Buffer.from(token.split('.')[1] as string, 'base64url').toString()) as {
    sub: string;
    iat: number;
    exp: number;
  };

describe('Segurança (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let prisma: PrismaService;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp();
    jwt = app.get(JwtService);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  const meWith = (token: string) =>
    request(server()).get('/api/users/me').set('Authorization', `Bearer ${token}`);

  describe('access token (RS02)', () => {
    it('vale por cerca de 15 minutos', async () => {
      const user = await registerUser(app);
      const { iat, exp } = decodePayload(user.accessToken);
      expect(exp - iat).toBe(900);
    });

    it('é rejeitado depois de expirar', async () => {
      const user = await registerUser(app);
      const expired = await jwt.signAsync({
        sub: user.userId,
        exp: Math.floor(Date.now() / 1000) - 60,
      });
      expect((await meWith(expired)).status).toBe(401);
    });

    it('é rejeitado quando assinado com outro segredo', async () => {
      const user = await registerUser(app);
      const forged = await new JwtService({
        secret: 'um-segredo-diferente-do-servidor-123',
      }).signAsync({ sub: user.userId }, { expiresIn: 900 });
      expect((await meWith(forged)).status).toBe(401);
    });

    it('é rejeitado quando o algoritmo é "none" (ataque clássico de JWT)', async () => {
      const user = await registerUser(app);
      const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
        sub: user.userId,
        exp: Math.floor(Date.now() / 1000) + 900,
      })}.`;
      expect((await meWith(unsigned)).status).toBe(401);
    });

    it('é rejeitado quando o payload é adulterado sem refazer a assinatura', async () => {
      const a = await registerUser(app);
      const b = await registerUser(app);
      const [header, , signature] = a.accessToken.split('.');
      const swapped = Buffer.from(
        JSON.stringify({ ...decodePayload(a.accessToken), sub: b.userId }),
      );
      const tampered = `${header}.${swapped.toString('base64url')}.${signature}`;
      expect((await meWith(tampered)).status).toBe(401);
    });

    it('de uma conta que deixou de existir não devolve dados', async () => {
      const user = await registerUser(app);
      await prisma.user.delete({ where: { id: user.userId } });
      expect((await meWith(user.accessToken)).status).toBe(401);
    });
  });

  describe('cabeçalhos de segurança e CORS (RS09)', () => {
    it('aplica os cabeçalhos do helmet nas rotas da API', async () => {
      const res = await request(server()).get('/api/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['strict-transport-security']).toBeDefined();
      expect(res.headers['content-security-policy']).toContain("default-src 'self'");
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('relaxa a CSP somente no Swagger', async () => {
      const docs = await request(server()).get('/api/docs');
      expect(docs.status).toBe(200);
      expect(docs.headers['content-security-policy']).toBeUndefined();
      expect(docs.headers['x-content-type-options']).toBe('nosniff');
    });

    it('não habilita CORS: outra origem não recebe permissão', async () => {
      const user = await registerUser(app);
      const simple = await request(server())
        .get('/api/areas')
        .set(bearer(user))
        .set('Origin', 'https://site-malicioso.example');
      const preflight = await request(server())
        .options('/api/areas')
        .set('Origin', 'https://site-malicioso.example')
        .set('Access-Control-Request-Method', 'GET');

      expect(simple.headers['access-control-allow-origin']).toBeUndefined();
      expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('rotas privadas por padrão (deny by default)', () => {
    it.each([
      ['GET', '/api/users/me'],
      ['PATCH', '/api/users/me'],
      ['GET', '/api/areas'],
      ['POST', '/api/areas'],
      ['POST', '/api/areas/0192f1a0-7b3c-7000-8000-000000000001/archive'],
      ['GET', '/api/activities'],
      ['POST', '/api/activities'],
      ['POST', '/api/activities/0192f1a0-7b3c-7000-8000-000000000001/archive'],
    ])('%s %s exige autenticação', async (method, path) => {
      const res = await request(server())[method.toLowerCase() as 'get' | 'post' | 'patch'](path);
      expect(res.status).toBe(401);
    });
  });
});
