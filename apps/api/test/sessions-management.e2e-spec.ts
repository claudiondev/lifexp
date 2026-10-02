import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { sessionListSchema } from '@lifexp/shared';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  VALID_PASSWORD,
  createTestApp,
  refreshCookieHeader,
  registerUser,
  type TestUser,
} from './helpers.js';

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

interface Device {
  token: string;
  cookie: string;
}

describe('Gestão de sessões (e2e, RF48)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
  });
  afterAll(async () => {
    await app.close();
  });

  const login = async (user: TestUser, userAgent: string): Promise<Device> => {
    const res = await request(server())
      .post('/api/auth/login')
      .set('User-Agent', userAgent)
      .send({ email: user.email, password: VALID_PASSWORD });
    expect(res.status).toBe(200);
    return { token: res.body.accessToken, cookie: refreshCookieHeader(res) };
  };
  const as = (device: Device) => ({ Authorization: `Bearer ${device.token}` });
  const list = async (device: Device) => {
    const res = await request(server()).get('/api/auth/sessions').set(as(device));
    expect(res.status).toBe(200);
    return sessionListSchema.parse(res.body);
  };
  const me = (device: Device) => request(server()).get('/api/users/me').set(as(device));
  const refresh = (device: Device) =>
    request(server()).post('/api/auth/refresh').set('Cookie', device.cookie);
  const revoke = (device: Device, id: string) =>
    request(server()).delete(`/api/auth/sessions/${id}`).set(as(device));
  /** Pessoa nova com dois aparelhos logados (o cadastro abre uma terceira sessão, de teste). */
  const setup = async () => {
    const user = await registerUser(app);
    const laptop = await login(user, CHROME_WINDOWS);
    const phone = await login(user, SAFARI_IPHONE);
    return { user, laptop, phone };
  };

  it('exige autenticação nas três rotas', async () => {
    const id = randomUUID();
    expect((await request(server()).get('/api/auth/sessions')).status).toBe(401);
    expect((await request(server()).delete(`/api/auth/sessions/${id}`)).status).toBe(401);
    expect((await request(server()).post('/api/auth/sessions/revoke-others')).status).toBe(401);
  });

  describe('listar', () => {
    it('mostra um item por aparelho, com nome legível, a atual primeiro', async () => {
      const { laptop } = await setup();

      const sessions = await list(laptop);

      expect(sessions).toHaveLength(3);
      expect(sessions[0]).toMatchObject({ device: 'Chrome · Windows', current: true });
      expect(sessions.filter((s) => s.current)).toHaveLength(1);
      expect(sessions.map((s) => s.device).sort()).toEqual([
        'Chrome · Windows',
        'Dispositivo desconhecido',
        'Safari · iOS',
      ]);
      expect(new Set(sessions.map((s) => s.id)).size).toBe(3);
    });

    it('cada aparelho vê a si mesmo como "atual"', async () => {
      const { laptop, phone } = await setup();
      expect((await list(laptop)).find((s) => s.current)?.device).toBe('Chrome · Windows');
      expect((await list(phone)).find((s) => s.current)?.device).toBe('Safari · iOS');
    });

    it('não expõe o User-Agent original nem IP (RS17)', async () => {
      const { laptop } = await setup();
      const res = await request(server()).get('/api/auth/sessions').set(as(laptop));
      const text = JSON.stringify(res.body);
      expect(text).not.toContain('Mozilla');
      expect(text).not.toContain('userAgent');
      expect(text).not.toMatch(/\bip\b/i);
      expect(text).not.toMatch(/refresh|tokenHash/i);
      for (const item of res.body) {
        expect(Object.keys(item).sort()).toEqual([
          'createdAt',
          'current',
          'device',
          'id',
          'lastUsedAt',
        ]);
      }
    });

    it('renovar o token não cria aparelho novo: a sessão é a mesma, com "último uso" mais novo', async () => {
      const { user, laptop } = await setup();
      const before = (await list(laptop)).find((s) => s.current)!;
      await new Promise((resolve) => setTimeout(resolve, 30));

      const renewed = await refresh(laptop);
      expect(renewed.status).toBe(200);
      const device: Device = {
        token: renewed.body.accessToken,
        cookie: refreshCookieHeader(renewed),
      };
      await refresh(device).then((res) => expect(res.status).toBe(200));

      const after = await list(device);
      expect(after).toHaveLength(3);
      const current = after.find((s) => s.current)!;
      expect(current.id).toBe(before.id);
      expect(current.createdAt).toBe(before.createdAt); // "entrou em" não anda
      expect(new Date(current.lastUsedAt).getTime()).toBeGreaterThan(
        new Date(before.lastUsedAt).getTime(),
      );
      // várias linhas de token no banco, uma única sessão na lista
      expect(await prisma.session.count({ where: { userId: user.userId } })).toBeGreaterThan(3);
    });

    it('não lista sessões encerradas nem expiradas', async () => {
      const { user, laptop, phone } = await setup();
      await request(server()).post('/api/auth/logout').set('Cookie', phone.cookie);
      expect(await list(laptop)).toHaveLength(2);

      await prisma.session.updateMany({
        where: { userId: user.userId, userAgent: null },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await prisma.session.updateMany({
        where: { userId: user.userId, userAgent: 'LifeXP-Teste/1.0' },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      expect((await list(laptop)).map((s) => s.device)).toEqual(['Chrome · Windows']);
    });

    it('cada pessoa só vê as próprias sessões (RS06)', async () => {
      const [a, b] = [await setup(), await setup()];
      const idsA = (await list(a.laptop)).map((s) => s.id);
      const idsB = (await list(b.laptop)).map((s) => s.id);
      expect(idsA.filter((id) => idsB.includes(id))).toEqual([]);
    });
  });

  describe('encerrar um aparelho', () => {
    it('o aparelho cai na hora: o token de acesso dele deixa de valer, sem esperar os 15 minutos', async () => {
      const { laptop, phone } = await setup();
      expect((await me(phone)).status).toBe(200);
      const phoneId = (await list(phone)).find((s) => s.current)!.id;

      const res = await revoke(laptop, phoneId);

      expect(res.status).toBe(204);
      // encerrar OUTRO aparelho nunca mexe no cookie de quem pediu (senão ele cairia na próxima renovação)
      expect(res.headers['set-cookie']).toBeUndefined();
      expect((await me(phone)).status).toBe(401);
      expect((await refresh(phone)).status).toBe(401);
      // o aparelho que pediu continua logado
      expect((await me(laptop)).status).toBe(200);
      expect((await refresh(laptop)).status).toBe(200);
      expect((await list(laptop)).map((s) => s.id)).not.toContain(phoneId);
    });

    it('é idempotente: encerrar de novo uma sessão sua não é erro', async () => {
      const { laptop, phone } = await setup();
      const phoneId = (await list(phone)).find((s) => s.current)!.id;
      expect((await revoke(laptop, phoneId)).status).toBe(204);
      expect((await revoke(laptop, phoneId)).status).toBe(204);
    });

    it('encerrar a própria sessão equivale a sair: limpa o cookie e derruba o token', async () => {
      const { laptop } = await setup();
      const ownId = (await list(laptop)).find((s) => s.current)!.id;

      const res = await revoke(laptop, ownId);

      expect(res.status).toBe(204);
      const cookies = (res.headers['set-cookie'] as unknown as string[]) ?? [];
      expect(cookies.some((c) => c.startsWith('refresh_token=;'))).toBe(true);
      expect((await me(laptop)).status).toBe(401);
      expect((await refresh(laptop)).status).toBe(401);
    });

    it('sessão de outra pessoa responde 404, igual a uma inexistente, e não é encerrada (RS06)', async () => {
      const [a, b] = [await setup(), await setup()];
      const bId = (await list(b.laptop)).find((s) => s.current)!.id;

      const foreign = await revoke(a.laptop, bId);
      const missing = await revoke(a.laptop, randomUUID());

      expect(foreign.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(foreign.body).toEqual(missing.body);
      expect((await me(b.laptop)).status).toBe(200);
      expect((await refresh(b.laptop)).status).toBe(200);
    });

    it('id que não é UUID responde 400', async () => {
      const { laptop } = await setup();
      expect((await revoke(laptop, 'abc')).status).toBe(400);
    });
  });

  describe('encerrar todas as outras', () => {
    it('derruba todos os outros aparelhos na hora e mantém o atual', async () => {
      const { laptop, phone } = await setup();

      const res = await request(server()).post('/api/auth/sessions/revoke-others').set(as(laptop));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ revoked: 2 }); // o celular e a sessão aberta no cadastro
      expect((await me(phone)).status).toBe(401);
      expect((await refresh(phone)).status).toBe(401);
      expect((await me(laptop)).status).toBe(200);
      expect(await list(laptop)).toHaveLength(1);
    });

    it('sem outras sessões, devolve zero e não muda nada', async () => {
      const { laptop } = await setup();
      await request(server()).post('/api/auth/sessions/revoke-others').set(as(laptop));
      const again = await request(server())
        .post('/api/auth/sessions/revoke-others')
        .set(as(laptop));
      expect(again.body).toEqual({ revoked: 0 });
      expect((await me(laptop)).status).toBe(200);
    });

    it('conta aparelhos, não linhas de token (renovações não inflam o número)', async () => {
      const { laptop, phone } = await setup();
      let device = phone;
      for (let round = 0; round < 3; round += 1) {
        const renewed = await refresh(device);
        device = { token: renewed.body.accessToken, cookie: refreshCookieHeader(renewed) };
      }
      const res = await request(server()).post('/api/auth/sessions/revoke-others').set(as(laptop));
      expect(res.body).toEqual({ revoked: 2 });
    });

    it('não toca nas sessões de outras pessoas (RS06)', async () => {
      const [a, b] = [await setup(), await setup()];
      await request(server()).post('/api/auth/sessions/revoke-others').set(as(a.laptop));
      expect((await me(b.laptop)).status).toBe(200);
      expect((await me(b.phone)).status).toBe(200);
      expect(await list(b.laptop)).toHaveLength(3);
    });
  });

  describe('o token de acesso depende da sessão (RS02, RS04)', () => {
    it('sair (logout) derruba o token de acesso na hora', async () => {
      const { laptop } = await setup();
      expect((await me(laptop)).status).toBe(200);
      await request(server()).post('/api/auth/logout').set('Cookie', laptop.cookie);
      expect((await me(laptop)).status).toBe(401);
    });

    it('token bem assinado, mas sem o id da sessão, é recusado', async () => {
      const user = await registerUser(app);
      const bare = await jwt.signAsync({ sub: user.userId }, { expiresIn: 900 });
      const res = await request(server())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${bare}`);
      expect(res.status).toBe(401);
    });

    it('token com a sessão de OUTRA pessoa é recusado', async () => {
      const [a, b] = [await setup(), await setup()];
      const bId = (await list(b.laptop)).find((s) => s.current)!.id;
      const forged = await jwt.signAsync({ sub: a.user.userId, sid: bId }, { expiresIn: 900 });
      const res = await request(server())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${forged}`);
      expect(res.status).toBe(401);
    });

    it('token com uma sessão inexistente é recusado', async () => {
      const user = await registerUser(app);
      const forged = await jwt.signAsync(
        { sub: user.userId, sid: randomUUID() },
        { expiresIn: 900 },
      );
      const res = await request(server())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${forged}`);
      expect(res.status).toBe(401);
    });

    it('sessão expirada no banco derruba o token, mesmo com ele ainda dentro dos 15 minutos', async () => {
      const { user, laptop } = await setup();
      await prisma.session.updateMany({
        where: { userId: user.userId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect((await me(laptop)).status).toBe(401);
    });

    it('o token novo, depois de renovar, também vale; o antigo continua valendo na mesma sessão', async () => {
      const { laptop } = await setup();
      const renewed = await refresh(laptop);
      const fresh: Device = {
        token: renewed.body.accessToken,
        cookie: refreshCookieHeader(renewed),
      };
      expect((await me(fresh)).status).toBe(200);
      expect((await me(laptop)).status).toBe(200); // mesma família, ainda ativa
    });
  });

  describe('renovação atômica', () => {
    it('em nenhum instante a sessão fica sem token ativo (revogar o antigo e criar o novo são uma só transação)', async () => {
      const { user, laptop } = await setup();
      const family = (
        await prisma.session.findFirstOrThrow({
          where: { userId: user.userId, userAgent: CHROME_WINDOWS },
        })
      ).tokenFamily;
      const seen: number[] = [];

      const original = prisma.$transaction.bind(prisma) as (
        fn: (tx: unknown) => Promise<unknown>,
        options?: unknown,
      ) => Promise<unknown>;
      const spy = vi.spyOn(prisma, '$transaction').mockImplementation(((
        fn: (tx: unknown) => Promise<unknown>,
        options?: unknown,
      ) =>
        original(async (tx) => {
          const wrapped = new Proxy(tx as object, {
            get(target, prop) {
              const value = Reflect.get(target, prop) as unknown;
              if (prop !== 'session') {
                return typeof value === 'function' ? value.bind(target) : value;
              }
              return new Proxy(value as object, {
                get(session, method) {
                  const member = Reflect.get(session, method) as unknown;
                  if (method !== 'create') {
                    return typeof member === 'function' ? member.bind(session) : member;
                  }
                  return async (...args: unknown[]) => {
                    // um observador de FORA da transação, no exato momento entre "revogar o antigo"
                    // e "criar o novo": a sessão ainda precisa ter um token ativo
                    seen.push(
                      await prisma.session.count({
                        where: { tokenFamily: family, revokedAt: null },
                      }),
                    );
                    return (member as (...a: unknown[]) => unknown).apply(session, args);
                  };
                },
              });
            },
          });
          return fn(wrapped);
        }, options)) as unknown as typeof prisma.$transaction);
      try {
        expect((await refresh(laptop)).status).toBe(200);
      } finally {
        spy.mockRestore();
      }

      expect(seen).toEqual([1]);
    });

    it('requisições em paralelo durante várias renovações nunca levam 401', async () => {
      const { laptop } = await setup();
      let device = laptop;
      const statuses: number[] = [];
      const storm = (async () => {
        for (let index = 0; index < 40; index += 1) {
          statuses.push((await me(laptop)).status);
        }
      })();
      for (let round = 0; round < 8; round += 1) {
        const renewed = await refresh(device);
        expect(renewed.status).toBe(200);
        device = { token: renewed.body.accessToken, cookie: refreshCookieHeader(renewed) };
      }
      await storm;

      expect(statuses).toHaveLength(40);
      expect(statuses.every((status) => status === 200)).toBe(true);
    });

    it('reuso de um token já trocado derruba só aquela sessão, e o aparelho some da lista', async () => {
      const { laptop, phone } = await setup();
      const renewed = await refresh(phone);
      expect(renewed.status).toBe(200);

      expect((await refresh(phone)).status).toBe(401); // reuso do cookie antigo
      expect((await me({ token: renewed.body.accessToken, cookie: '' })).status).toBe(401);
      expect((await list(laptop)).map((s) => s.device)).not.toContain('Safari · iOS');
      expect((await me(laptop)).status).toBe(200);
    });
  });
});
