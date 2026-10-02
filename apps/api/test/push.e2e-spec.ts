import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { MAX_PUSH_DEVICES } from '../src/push/push-subscriptions.service.js';
import { FakePushSender, bearer, createTestApp, registerUser, type TestUser } from './helpers.js';

const keys = {
  p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
  auth: 'tBHItJI5svbpez7KI4CCXg',
};
let counter = 0;
const endpoint = () => `https://fcm.googleapis.com/fcm/send/aparelho-${Date.now()}-${counter++}`;

describe('Push no celular: inscrições (e2e, RF41)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sender = new FakePushSender();
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp({ pushSender: sender });
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => sender.reset());

  const subscribe = (user: TestUser, body: object) =>
    request(server()).post('/api/push/subscriptions').set(bearer(user)).send(body);
  const devices = async (user: TestUser) =>
    (await request(server()).get('/api/push/subscriptions').set(bearer(user))).body
      .devices as number;

  describe('configuração', () => {
    it('informa que o push está ligado e a chave pública VAPID', async () => {
      const user = await registerUser(app);
      const res = await request(server()).get('/api/push/config').set(bearer(user));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ enabled: true, publicKey: sender.publicKey });
    });

    it('sem chaves VAPID, informa desligado e não aceita inscrição nem teste (409)', async () => {
      const user = await registerUser(app);
      sender.enabled = false;
      expect((await request(server()).get('/api/push/config').set(bearer(user))).body.enabled).toBe(
        false,
      );
      const res = await subscribe(user, { endpoint: endpoint(), keys });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('O push não está configurado neste servidor');
      expect((await request(server()).post('/api/push/test').set(bearer(user))).status).toBe(409);
      expect(await prisma.pushSubscription.count({ where: { userId: user.userId } })).toBe(0);
    });

    it('o teste de envio também recusa com o push desligado, mesmo para quem já tinha aparelho inscrito', async () => {
      const user = await registerUser(app);
      await prisma.pushSubscription.create({
        data: { userId: user.userId, endpoint: endpoint(), ...keys },
      });
      sender.enabled = false;

      const res = await request(server()).post('/api/push/test').set(bearer(user));
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('O push não está configurado neste servidor');
      expect(sender.sent).toHaveLength(0);
    });
  });

  describe('inscrever e cancelar', () => {
    it('inscreve o aparelho (201) e conta os aparelhos da pessoa', async () => {
      const user = await registerUser(app);
      expect(await devices(user)).toBe(0);

      const ep = endpoint();
      const res = await subscribe(user, { endpoint: ep, keys });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ devices: 1 });
      const row = await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint: ep } });
      expect(row).toMatchObject({ userId: user.userId, p256dh: keys.p256dh, auth: keys.auth });
    });

    it('inscrever o mesmo aparelho de novo é seguro: não duplica e atualiza as chaves', async () => {
      const user = await registerUser(app);
      const ep = endpoint();
      await subscribe(user, { endpoint: ep, keys });
      const again = await subscribe(user, {
        endpoint: ep,
        keys: { ...keys, auth: 'OutraChaveAuth123456' },
      });

      expect(again.status).toBe(201);
      expect(again.body).toEqual({ devices: 1 });
      expect(
        (await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint: ep } })).auth,
      ).toBe('OutraChaveAuth123456');
    });

    it('o aparelho que entra em outra conta passa a ser dela (e sai da anterior)', async () => {
      const [ana, bia] = [await registerUser(app), await registerUser(app)];
      const ep = endpoint();
      await subscribe(ana, { endpoint: ep, keys });

      const res = await subscribe(bia, { endpoint: ep, keys });
      expect(res.status).toBe(201);
      expect(await devices(ana)).toBe(0);
      expect(await devices(bia)).toBe(1);
    });

    it(`limite de ${MAX_PUSH_DEVICES} aparelhos: o seguinte dá 409, mesmo com pedidos simultâneos`, async () => {
      const user = await registerUser(app);
      await prisma.pushSubscription.createMany({
        data: Array.from({ length: MAX_PUSH_DEVICES - 2 }, () => ({
          userId: user.userId,
          endpoint: endpoint(),
          ...keys,
        })),
      });
      const statuses = await Promise.all(
        Array.from({ length: 5 }, () =>
          subscribe(user, { endpoint: endpoint(), keys }).then((r) => r.status),
        ),
      );
      expect(statuses.filter((s) => s === 201)).toHaveLength(2);
      expect(statuses.filter((s) => s === 409)).toHaveLength(3);
      expect(await devices(user)).toBe(MAX_PUSH_DEVICES);
    });

    it('já no limite, reinscrever um aparelho existente continua valendo', async () => {
      const user = await registerUser(app);
      const existing = endpoint();
      await prisma.pushSubscription.createMany({
        data: [
          { userId: user.userId, endpoint: existing, ...keys },
          ...Array.from({ length: MAX_PUSH_DEVICES - 1 }, () => ({
            userId: user.userId,
            endpoint: endpoint(),
            ...keys,
          })),
        ],
      });
      expect((await subscribe(user, { endpoint: existing, keys })).status).toBe(201);
    });

    it('recusa corpo inválido (400): host que não é de serviço de push (SSRF), http, chaves ruins, campo a mais', async () => {
      const user = await registerUser(app);
      const bad = [
        { endpoint: 'https://evil.example.com/push', keys },
        { endpoint: 'https://169.254.169.254/latest/meta-data', keys },
        { endpoint: 'https://fcm.googleapis.com.evil.com/x', keys },
        { endpoint: 'http://fcm.googleapis.com/x', keys },
        { endpoint: endpoint(), keys: { ...keys, auth: 'tem espaço!' } },
        { endpoint: endpoint(), keys: { p256dh: keys.p256dh } },
        { endpoint: endpoint(), keys, userId: user.userId },
        { keys },
      ];
      for (const body of bad) expect((await subscribe(user, body)).status).toBe(400);
      expect(await devices(user)).toBe(0);
    });

    it('cancela a inscrição do próprio aparelho (204) e cancelar de novo também é 204', async () => {
      const user = await registerUser(app);
      const ep = endpoint();
      await subscribe(user, { endpoint: ep, keys });

      const first = await request(server())
        .delete('/api/push/subscriptions')
        .set(bearer(user))
        .send({ endpoint: ep });
      expect(first.status).toBe(204);
      expect(await devices(user)).toBe(0);
      const second = await request(server())
        .delete('/api/push/subscriptions')
        .set(bearer(user))
        .send({ endpoint: ep });
      expect(second.status).toBe(204);
    });

    it('cancelar o endereço de OUTRA pessoa não apaga nada (e não revela que existe)', async () => {
      const [ana, bia] = [await registerUser(app), await registerUser(app)];
      const ep = endpoint();
      await subscribe(ana, { endpoint: ep, keys });

      const res = await request(server())
        .delete('/api/push/subscriptions')
        .set(bearer(bia))
        .send({ endpoint: ep });
      expect(res.status).toBe(204);
      expect(await devices(ana)).toBe(1);
    });

    it('cada pessoa vê só os próprios aparelhos', async () => {
      const [ana, bia] = [await registerUser(app), await registerUser(app)];
      await subscribe(ana, { endpoint: endpoint(), keys });
      await subscribe(ana, { endpoint: endpoint(), keys });
      await subscribe(bia, { endpoint: endpoint(), keys });
      expect(await devices(ana)).toBe(2);
      expect(await devices(bia)).toBe(1);
    });

    it('as inscrições somem junto com a conta', async () => {
      const user = await registerUser(app);
      await subscribe(user, { endpoint: endpoint(), keys });
      await prisma.user.delete({ where: { id: user.userId } });
      expect(await prisma.pushSubscription.count({ where: { userId: user.userId } })).toBe(0);
    });
  });

  describe('enviar teste', () => {
    it('manda um aviso de teste a todos os aparelhos e conta quantos saíram', async () => {
      const user = await registerUser(app);
      const [a, b] = [endpoint(), endpoint()];
      await subscribe(user, { endpoint: a, keys });
      await subscribe(user, { endpoint: b, keys });

      const res = await request(server()).post('/api/push/test').set(bearer(user));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ sent: 2 });
      expect(sender.sent.map((s) => s.target.endpoint).sort()).toEqual([a, b].sort());
      expect(sender.sent[0]!.payload).toMatchObject({ title: 'LifeXP', url: '/', tag: 'test' });
    });

    it('apaga a inscrição que o navegador cancelou (gone) e segue com as outras', async () => {
      const user = await registerUser(app);
      const [alive, dead] = [endpoint(), endpoint()];
      await subscribe(user, { endpoint: alive, keys });
      await subscribe(user, { endpoint: dead, keys });
      sender.outcomes.set(dead, 'gone');

      const res = await request(server()).post('/api/push/test').set(bearer(user));
      expect(res.body).toEqual({ sent: 1 });
      expect(await devices(user)).toBe(1);
    });

    it('falha passageira não apaga a inscrição', async () => {
      const user = await registerUser(app);
      const ep = endpoint();
      await subscribe(user, { endpoint: ep, keys });
      sender.outcomes.set(ep, 'failed');

      expect((await request(server()).post('/api/push/test').set(bearer(user))).body).toEqual({
        sent: 0,
      });
      expect(await devices(user)).toBe(1);
    });

    it('sem nenhum aparelho inscrito, 409 com a orientação', async () => {
      const user = await registerUser(app);
      const res = await request(server()).post('/api/push/test').set(bearer(user));
      expect(res.status).toBe(409);
      expect(res.body.message).toContain('Nenhum aparelho inscrito');
    });

    it('só atinge os aparelhos da própria pessoa', async () => {
      const [ana, bia] = [await registerUser(app), await registerUser(app)];
      const hers = endpoint();
      await subscribe(ana, { endpoint: endpoint(), keys });
      await subscribe(bia, { endpoint: hers, keys });

      await request(server()).post('/api/push/test').set(bearer(ana));
      expect(sender.sent.map((s) => s.target.endpoint)).not.toContain(hers);
    });
  });

  it('exige autenticação em todas as rotas', async () => {
    for (const [method, url] of [
      ['get', '/api/push/config'],
      ['get', '/api/push/subscriptions'],
      ['post', '/api/push/subscriptions'],
      ['delete', '/api/push/subscriptions'],
      ['post', '/api/push/test'],
    ] as const) {
      expect((await request(server())[method](url)).status).toBe(401);
    }
  });
});
