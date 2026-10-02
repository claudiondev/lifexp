import { Logger, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { hashResetToken } from '../src/auth/domain/password-reset.js';
import {
  FakeClock,
  FakeMailer,
  VALID_PASSWORD,
  bearer,
  createTestApp,
  refreshCookieHeader,
  registerUser,
  uniqueEmail,
  type TestUser,
} from './helpers.js';

const NOW = '2026-10-07T15:00:00.000Z';
const NEW_PASSWORD = 'senha-nova-456';
const MIN = 60_000;

describe('Recuperação de senha por e-mail (e2e, RF05)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const clock = new FakeClock(NOW);
  const mailer = new FakeMailer();
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp({ clock, mailer });
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    clock.set(NOW);
    mailer.failNext = 0;
  });

  const advance = (ms: number) => clock.set(new Date(clock.now().getTime() + ms).toISOString());
  const forgot = (body: object) => request(server()).post('/api/auth/forgot-password').send(body);
  const reset = (token: string, password = NEW_PASSWORD) =>
    request(server()).post('/api/auth/reset-password').send({ token, password });
  const login = (email: string, password: string) =>
    request(server()).post('/api/auth/login').send({ email, password });
  const mailsTo = (email: string) => mailer.sent.filter((message) => message.to === email);
  const tokens = (user: TestUser) =>
    prisma.passwordResetToken.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: 'asc' },
    });

  /** O envio não é aguardado pela rota: espera o e-mail aparecer. */
  const waitForMail = async (email: string, count = 1) => {
    for (let attempt = 0; attempt < 100 && mailsTo(email).length < count; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return mailsTo(email);
  };
  const tokenFrom = (text: string) => {
    const match = /#token=([A-Za-z0-9_-]+)/.exec(text);
    if (!match) throw new Error('E-mail sem link de recuperação');
    return match[1]!;
  };
  /** Pede a recuperação e devolve o token que chegou por e-mail. */
  const requestToken = async (user: TestUser) => {
    const before = mailsTo(user.email).length;
    expect((await forgot({ email: user.email })).status).toBe(204);
    const mails = await waitForMail(user.email, before + 1);
    expect(mails).toHaveLength(before + 1);
    return tokenFrom(mails.at(-1)!.text);
  };

  describe('pedir a recuperação', () => {
    it('manda um e-mail com o link, e no banco fica só o hash do token', async () => {
      const user = await registerUser(app);

      const res = await forgot({ email: user.email });

      expect(res.status).toBe(204);
      expect(res.body).toEqual({});
      const [mail] = await waitForMail(user.email);
      expect(mail!.subject).toBe('Redefinir sua senha do LifeXP');
      expect(mail!.text).toMatch(
        /http:\/\/localhost:5173\/redefinir-senha#token=[A-Za-z0-9_-]{43}\n/,
      );
      const token = tokenFrom(mail!.text);
      const [row] = await tokens(user);
      expect(row).toMatchObject({
        tokenHash: hashResetToken(token),
        usedAt: null,
        createdAt: new Date(NOW),
        expiresAt: new Date('2026-10-07T15:30:00.000Z'),
      });
      expect(JSON.stringify(row)).not.toContain(token);
    });

    it('acha a conta mesmo com maiúsculas e espaços no e-mail', async () => {
      const user = await registerUser(app);
      expect((await forgot({ email: `  ${user.email.toUpperCase()} ` })).status).toBe(204);
      expect(await waitForMail(user.email)).toHaveLength(1);
    });

    it('e-mail desconhecido responde igualzinho e não envia nada (RS13)', async () => {
      const user = await registerUser(app);
      const unknown = uniqueEmail();
      const sentBefore = mailer.sent.length;

      const known = await forgot({ email: user.email });
      const missing = await forgot({ email: unknown });

      expect(missing.status).toBe(known.status);
      expect(missing.body).toEqual(known.body);
      expect(missing.text).toBe(known.text);
      await waitForMail(user.email);
      expect(mailsTo(unknown)).toHaveLength(0);
      expect(mailer.sent.length).toBe(sentBefore + 1);
    });

    it('falha do provedor de e-mail não muda a resposta nem derruba a rota', async () => {
      const user = await registerUser(app);
      mailer.failNext = 1;
      expect((await forgot({ email: user.email })).status).toBe(204);
      expect(await tokens(user)).toHaveLength(1);
    });

    it('não espera o provedor de e-mail: o tempo de envio não denuncia que a conta existe', async () => {
      const user = await registerUser(app);
      let release = () => {};
      const stuck = new Promise<void>((resolve) => (release = resolve));
      const spy = vi.spyOn(mailer, 'send').mockImplementation(() => stuck);
      try {
        // se a rota esperasse o envio, esta chamada nunca terminaria (o teste estouraria o tempo)
        const res = await forgot({ email: user.email });
        expect(res.status).toBe(204);
        expect(spy).toHaveBeenCalledTimes(1);
      } finally {
        release();
        spy.mockRestore();
      }
    }, 5_000);

    it('rejeita corpo inválido: e-mail malformado, ausente ou com campos extras (400)', async () => {
      expect((await forgot({ email: 'ana' })).status).toBe(400);
      expect((await forgot({})).status).toBe(400);
      expect((await forgot({ email: uniqueEmail(), userId: 'x' })).status).toBe(400);
    });

    it('segura um segundo e-mail por 2 minutos; depois disso, o link novo invalida o anterior', async () => {
      const user = await registerUser(app);
      const first = await requestToken(user);

      advance(2 * MIN - 1);
      expect((await forgot({ email: user.email })).status).toBe(204);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(mailsTo(user.email)).toHaveLength(1);
      expect(await tokens(user)).toHaveLength(1);

      advance(1);
      const second = await requestToken(user);
      expect(second).not.toBe(first);
      const rows = await tokens(user);
      expect(rows.map((row) => row.usedAt !== null)).toEqual([true, false]);

      expect((await reset(first)).status).toBe(400);
      expect((await reset(second)).status).toBe(204);
    });

    it('pedidos simultâneos geram um único e-mail e um único token aberto', async () => {
      const user = await registerUser(app);

      const statuses = await Promise.all(
        Array.from({ length: 6 }, async () => (await forgot({ email: user.email })).status),
      );

      expect(statuses).toEqual(Array(6).fill(204));
      await waitForMail(user.email);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(mailsTo(user.email)).toHaveLength(1);
      expect(await tokens(user)).toHaveLength(1);
    });

    it('o pedido entra na fila da trava da pessoa (é ela que impede dois e-mails em pedidos simultâneos)', async () => {
      const user = await registerUser(app);
      let pending: Promise<number> | undefined;

      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.userId} FOR NO KEY UPDATE`;
        pending = forgot({ email: user.email }).then((res) => res.status);
        await new Promise((resolve) => setTimeout(resolve, 400));
        // enquanto "outro pedido" segura a pessoa, este espera: nada foi gravado ainda
        expect(await tokens(user)).toHaveLength(0);
      });

      expect(await pending).toBe(204);
      expect(await tokens(user)).toHaveLength(1);
    });

    it('o pedido de uma pessoa não mexe nos tokens de outra', async () => {
      const [ana, bia] = [await registerUser(app), await registerUser(app)];
      const anaToken = await requestToken(ana);
      await requestToken(bia);

      expect((await tokens(ana)).map((row) => row.usedAt)).toEqual([null]);
      expect((await reset(anaToken)).status).toBe(204);
      expect((await tokens(bia)).map((row) => row.usedAt)).toEqual([null]);
    });
  });

  describe('redefinir a senha', () => {
    it('troca a senha: a nova entra, a antiga não', async () => {
      const user = await registerUser(app);
      const token = await requestToken(user);

      const res = await reset(token);

      expect(res.status).toBe(204);
      expect((await login(user.email, VALID_PASSWORD)).status).toBe(401);
      expect((await login(user.email, NEW_PASSWORD)).status).toBe(200);
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.userId } });
      expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
      expect(stored.passwordHash).not.toContain(NEW_PASSWORD);
    });

    it('não abre sessão sozinho: a resposta não traz token nem cookie', async () => {
      const user = await registerUser(app);
      const res = await reset(await requestToken(user));
      expect(res.body).toEqual({});
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('o token é de uso único (RS12): a segunda tentativa falha e a senha não muda de novo', async () => {
      const user = await registerUser(app);
      const token = await requestToken(user);
      expect((await reset(token)).status).toBe(204);

      const again = await reset(token, 'outra-senha-789');

      expect(again.status).toBe(400);
      expect(again.body.message).toBe('Link inválido ou expirado');
      expect((await login(user.email, 'outra-senha-789')).status).toBe(401);
      expect((await login(user.email, NEW_PASSWORD)).status).toBe(200);
    });

    it('dois usos simultâneos do mesmo link: só um passa', async () => {
      const user = await registerUser(app);
      const token = await requestToken(user);

      const results = await Promise.all([
        reset(token, 'senha-paralela-a1'),
        reset(token, 'senha-paralela-b2'),
        reset(token, 'senha-paralela-c3'),
      ]);

      expect(results.map((res) => res.status).sort()).toEqual([204, 400, 400]);
      const winner = ['senha-paralela-a1', 'senha-paralela-b2', 'senha-paralela-c3'][
        results.findIndex((res) => res.status === 204)
      ]!;
      expect((await login(user.email, winner)).status).toBe(200);
    });

    it('expira em 30 minutos (RS12): vale até o último instante e depois não', async () => {
      const user = await registerUser(app);
      const late = await requestToken(user);
      advance(30 * MIN);
      const expired = await reset(late);
      expect(expired.status).toBe(400);
      expect(expired.body.message).toBe('Link inválido ou expirado');
      expect((await login(user.email, VALID_PASSWORD)).status).toBe(200);

      const other = await registerUser(app);
      const inTime = await requestToken(other);
      advance(30 * MIN - 1);
      expect((await reset(inTime)).status).toBe(204);
    });

    it('token desconhecido, e o hash no lugar do token, dão o mesmo erro genérico', async () => {
      const user = await registerUser(app);
      const token = await requestToken(user);

      const unknown = await reset('a'.repeat(43));
      const withHash = await reset(hashResetToken(token));

      expect(unknown.status).toBe(400);
      expect(unknown.body.message).toBe('Link inválido ou expirado');
      expect(withHash.status).toBe(400);
      expect((await login(user.email, VALID_PASSWORD)).status).toBe(200);
    });

    it('rejeita senha fraca, token malformado e campos extras sem gastar o token (400)', async () => {
      const user = await registerUser(app);
      const token = await requestToken(user);

      expect((await reset(token, '1234567')).status).toBe(400);
      expect((await reset(token, 'a'.repeat(73))).status).toBe(400);
      expect((await reset('curto')).status).toBe(400);
      expect(
        (
          await request(server())
            .post('/api/auth/reset-password')
            .send({ token, password: NEW_PASSWORD, email: uniqueEmail() })
        ).status,
      ).toBe(400);

      expect((await reset(token)).status).toBe(204);
    });

    it('o token só troca a senha da pessoa que pediu', async () => {
      const [ana, bia] = [await registerUser(app), await registerUser(app)];
      const anaToken = await requestToken(ana);

      expect((await reset(anaToken)).status).toBe(204);

      expect((await login(ana.email, NEW_PASSWORD)).status).toBe(200);
      expect((await login(bia.email, NEW_PASSWORD)).status).toBe(401);
      expect((await login(bia.email, VALID_PASSWORD)).status).toBe(200);
    });

    it('encerra todas as sessões da pessoa: o refresh antigo para de valer', async () => {
      const user = await registerUser(app);
      const first = await login(user.email, VALID_PASSWORD);
      const second = await login(user.email, VALID_PASSWORD);
      const other = await registerUser(app);
      const otherLogin = await login(other.email, VALID_PASSWORD);
      const refresh = (cookie: string) =>
        request(server()).post('/api/auth/refresh').set('Cookie', cookie);

      expect((await reset(await requestToken(user))).status).toBe(204);

      expect((await refresh(refreshCookieHeader(first))).status).toBe(401);
      expect((await refresh(refreshCookieHeader(second))).status).toBe(401);
      expect(await prisma.session.count({ where: { userId: user.userId, revokedAt: null } })).toBe(
        0,
      );
      // a sessão de outra pessoa continua de pé
      expect((await refresh(refreshCookieHeader(otherLogin))).status).toBe(200);
    });

    it('os tokens de acesso já emitidos também caem na hora (não esperam os 15 minutos)', async () => {
      const user = await registerUser(app);
      const meWith = () =>
        request(server()).get('/api/users/me').set('Authorization', `Bearer ${user.accessToken}`);
      expect((await meWith()).status).toBe(200);

      expect((await reset(await requestToken(user))).status).toBe(204);

      expect((await meWith()).status).toBe(401);
    });

    it('redefinir encerra os outros links ainda abertos da pessoa', async () => {
      const user = await registerUser(app);
      const first = await requestToken(user);
      // estado forçado no banco: um segundo token aberto ao mesmo tempo
      await prisma.passwordResetToken.create({
        data: {
          userId: user.userId,
          tokenHash: hashResetToken('b'.repeat(43)),
          createdAt: clock.now(),
          expiresAt: new Date(clock.now().getTime() + 30 * MIN),
        },
      });

      expect((await reset(first)).status).toBe(204);

      expect((await reset('b'.repeat(43), 'senha-do-invasor-1')).status).toBe(400);
      expect((await tokens(user)).every((row) => row.usedAt !== null)).toBe(true);
    });

    it('as rotas são públicas, e o resto continua exigindo login', async () => {
      const user = await registerUser(app);
      expect((await forgot({ email: user.email })).status).toBe(204);
      expect((await request(server()).get('/api/users/me')).status).toBe(401);
      expect((await request(server()).get('/api/users/me').set(bearer(user))).status).toBe(200);
    });
  });

  describe('logs (RS14)', () => {
    it('nem o token, nem o link, nem a senha, nem o e-mail completo vão para o log', async () => {
      const lines: string[] = [];
      const capture = (...args: unknown[]) => void lines.push(args.map(String).join(' '));
      const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map((level) =>
        vi.spyOn(Logger.prototype, level).mockImplementation(capture),
      );
      try {
        const user = await registerUser(app);
        const token = await requestToken(user);
        advance(2 * MIN);
        mailer.failNext = 1;
        await forgot({ email: user.email });
        await new Promise((resolve) => setTimeout(resolve, 50));
        await reset('a'.repeat(43));
        await reset(token);

        const output = lines.join('\n');
        expect(output).toContain('Falha ao enviar o e-mail de recuperação');
        expect(output).toContain('provedor fora do ar');
        expect(output).not.toContain(token);
        expect(output).not.toContain('#token=');
        expect(output).not.toContain(NEW_PASSWORD);
        expect(output).not.toContain(user.email);
        for (const row of await tokens(user)) expect(output).not.toContain(row.tokenHash);
      } finally {
        spies.forEach((spy) => spy.mockRestore());
      }
    });
  });
});
