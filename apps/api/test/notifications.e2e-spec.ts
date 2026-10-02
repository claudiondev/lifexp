import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { notificationPageSchema, notificationPreferencesSchema } from '@lifexp/shared';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { FakeClock, bearer, createTestApp, registerUser, type TestUser } from './helpers.js';

const NOW = '2026-10-07T15:00:00.000Z';

describe('Central de notificações e preferências (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const clock = new FakeClock(NOW);
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp({ clock });
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => clock.set(NOW));

  const send = (method: 'get' | 'post' | 'put', user: TestUser, path: string, body?: object) => {
    const req = request(server())[method](path).set(bearer(user));
    return body ? req.send(body) : req;
  };

  /** Cria avisos direto no banco, do mais antigo ao mais novo (os ids v7 saem em ordem). */
  const seed = async (user: TestUser, count: number, kind: 'DIGEST' = 'DIGEST') => {
    const ids: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const row = await prisma.notification.create({
        data: {
          userId: user.userId,
          kind,
          title: `Aviso ${index + 1}`,
          body: 'corpo',
          scheduledFor: new Date(`2026-10-0${(index % 9) + 1}T10:00:00.000Z`),
          dedupeKey: `digest:2026-09-${String(index + 1).padStart(2, '0')}`,
        },
      });
      ids.push(row.id);
    }
    return ids;
  };
  const page = async (user: TestUser, query = '') => {
    const res = await send('get', user, `/api/notifications${query}`);
    expect(res.status).toBe(200);
    return notificationPageSchema.parse(res.body);
  };

  describe('autenticação', () => {
    it.each([
      ['get', '/api/notifications'],
      ['get', '/api/notifications/unread-count'],
      ['post', '/api/notifications/read-all'],
      ['post', '/api/notifications/0192f1a0-7b3c-7000-8000-0000000000c1/read'],
      ['get', '/api/notification-preferences'],
      ['put', '/api/notification-preferences'],
    ] as const)('%s %s exige login', async (method, path) => {
      expect((await request(server())[method](path)).status).toBe(401);
    });
  });

  describe('listar', () => {
    it('conta nova: lista vazia, sem cursor, zero não lidas', async () => {
      const user = await registerUser(app);
      expect(await page(user)).toEqual({ items: [], nextCursor: null });
      expect((await send('get', user, '/api/notifications/unread-count')).body).toEqual({
        count: 0,
      });
    });

    it('traz do mais novo ao mais antigo, com os campos da API (tipo em minúsculas)', async () => {
      const user = await registerUser(app);
      const ids = await seed(user, 3);

      const { items } = await page(user);

      expect(items.map((n) => n.id)).toEqual([...ids].reverse());
      expect(items[0]).toMatchObject({
        kind: 'digest',
        title: 'Aviso 3',
        body: 'corpo',
        readAt: null,
        blockId: null,
        occurrenceDate: null,
        eventId: null,
      });
    });

    it('mostra a origem de um aviso de bloco (bloco e data original)', async () => {
      const user = await registerUser(app);
      await prisma.notification.create({
        data: {
          userId: user.userId,
          kind: 'BLOCK',
          title: 'Corrida começa em 15 minutos',
          body: 'Das 09:00 às 10:00.',
          scheduledFor: new Date('2026-10-07T11:45:00.000Z'),
          dedupeKey: 'block:b:2026-10-07:15',
          blockId: '0192f1a0-7b3c-7000-8000-0000000000b1',
          occurrenceDate: new Date('2026-10-07T00:00:00.000Z'),
        },
      });

      const [item] = (await page(user)).items;
      expect(item).toMatchObject({
        kind: 'block',
        blockId: '0192f1a0-7b3c-7000-8000-0000000000b1',
        occurrenceDate: '2026-10-07',
      });
    });

    it('pagina por cursor sem repetir nem pular itens (RNF08)', async () => {
      const user = await registerUser(app);
      const ids = await seed(user, 5);
      const expected = [...ids].reverse();

      const first = await page(user, '?limit=2');
      expect(first.items.map((n) => n.id)).toEqual(expected.slice(0, 2));
      expect(first.nextCursor).toBe(expected[1]);

      const second = await page(user, `?limit=2&before=${first.nextCursor}`);
      expect(second.items.map((n) => n.id)).toEqual(expected.slice(2, 4));

      const third = await page(user, `?limit=2&before=${second.nextCursor}`);
      expect(third.items.map((n) => n.id)).toEqual(expected.slice(4));
      expect(third.nextCursor).toBeNull();
    });

    it('uma página exatamente cheia no fim não promete outra', async () => {
      const user = await registerUser(app);
      await seed(user, 4);
      const { items, nextCursor } = await page(user, '?limit=4');
      expect(items).toHaveLength(4);
      expect(nextCursor).toBeNull();
    });

    it('o limite padrão é 20 e o máximo é 100', async () => {
      const user = await registerUser(app);
      await seed(user, 25);

      expect((await page(user)).items).toHaveLength(20);
      expect((await send('get', user, '/api/notifications?limit=101')).status).toBe(400);
      expect((await send('get', user, '/api/notifications?limit=0')).status).toBe(400);
      expect((await send('get', user, '/api/notifications?before=abc')).status).toBe(400);
    });

    it('filtra só as não lidas', async () => {
      const user = await registerUser(app);
      const ids = await seed(user, 3);
      await send('post', user, `/api/notifications/${ids[1]}/read`);

      const unread = await page(user, '?unread=true');
      expect(unread.items.map((n) => n.id)).toEqual([ids[2], ids[0]]);
      expect((await page(user)).items).toHaveLength(3);
    });

    it('nunca mistura avisos de outra pessoa', async () => {
      const [ana, bia] = [await registerUser(app), await registerUser(app)];
      const [mine] = await seed(ana, 1);
      await seed(bia, 2);

      expect((await page(ana)).items.map((n) => n.id)).toEqual([mine]);
      expect((await send('get', ana, '/api/notifications/unread-count')).body).toEqual({
        count: 1,
      });
    });
  });

  describe('marcar como lida', () => {
    it('marca com a hora do relógio e o contador cai', async () => {
      const user = await registerUser(app);
      const [id] = await seed(user, 2);

      const res = await send('post', user, `/api/notifications/${id}/read`);

      expect(res.status).toBe(200);
      expect(res.body.readAt).toBe(NOW);
      expect((await send('get', user, '/api/notifications/unread-count')).body).toEqual({
        count: 1,
      });
    });

    it('é idempotente: marcar de novo mantém a data da primeira leitura', async () => {
      const user = await registerUser(app);
      const [id] = await seed(user, 1);
      await send('post', user, `/api/notifications/${id}/read`);

      clock.set('2026-10-08T15:00:00.000Z');
      const again = await send('post', user, `/api/notifications/${id}/read`);

      expect(again.status).toBe(200);
      expect(again.body.readAt).toBe(NOW);
    });

    it('aviso de outra pessoa ou inexistente responde 404 e não é alterado; id inválido é 400', async () => {
      const [ana, bia] = [await registerUser(app), await registerUser(app)];
      const [id] = await seed(ana, 1);

      expect((await send('post', bia, `/api/notifications/${id}/read`)).status).toBe(404);
      expect(
        (await send('post', bia, '/api/notifications/0192f1a0-7b3c-7000-8000-0000000000ff/read'))
          .status,
      ).toBe(404);
      expect((await send('post', bia, '/api/notifications/abc/read')).status).toBe(400);
      expect(
        (await prisma.notification.findUniqueOrThrow({ where: { id: id! } })).readAt,
      ).toBeNull();
    });

    it('marcar todas devolve quantas mudaram, só da própria pessoa, e é idempotente', async () => {
      const [ana, bia] = [await registerUser(app), await registerUser(app)];
      const ids = await seed(ana, 3);
      await seed(bia, 2);
      await send('post', ana, `/api/notifications/${ids[0]}/read`);

      const first = await send('post', ana, '/api/notifications/read-all');
      expect(first.status).toBe(200);
      expect(first.body).toEqual({ updated: 2 });
      expect((await send('post', ana, '/api/notifications/read-all')).body).toEqual({ updated: 0 });
      expect((await send('get', ana, '/api/notifications/unread-count')).body).toEqual({
        count: 0,
      });
      expect((await send('get', bia, '/api/notifications/unread-count')).body).toEqual({
        count: 2,
      });
    });

    it('a primeira leitura individual não é sobrescrita por "marcar todas"', async () => {
      const user = await registerUser(app);
      const [id] = await seed(user, 2);
      await send('post', user, `/api/notifications/${id}/read`);
      clock.set('2026-10-08T15:00:00.000Z');

      await send('post', user, '/api/notifications/read-all');

      const row = await prisma.notification.findUniqueOrThrow({ where: { id: id! } });
      expect(row.readAt!.toISOString()).toBe(NOW);
    });
  });

  describe('preferências (RF40)', () => {
    const get = async (user: TestUser) => {
      const res = await send('get', user, '/api/notification-preferences');
      expect(res.status).toBe(200);
      return notificationPreferencesSchema.parse(res.body);
    };

    it('sem nunca alterar, devolve os padrões (RN24)', async () => {
      const user = await registerUser(app);
      expect(await get(user)).toEqual({
        blockRemindersEnabled: true,
        blockLeadMin: 15,
        eventRemindersEnabled: true,
        digestEnabled: true,
        digestTime: '07:00',
        digestEmailEnabled: false,
        weeklyReportEnabled: true,
        pushEnabled: false,
      });
      expect(await prisma.notificationPreference.count({ where: { userId: user.userId } })).toBe(0);
    });

    it('altera só o que foi enviado e guarda para as próximas leituras', async () => {
      const user = await registerUser(app);

      const res = await send('put', user, '/api/notification-preferences', {
        blockLeadMin: 30,
        digestEmailEnabled: true,
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        blockLeadMin: 30,
        digestEmailEnabled: true,
        digestTime: '07:00',
        blockRemindersEnabled: true,
      });
      expect(await get(user)).toMatchObject({ blockLeadMin: 30, digestEmailEnabled: true });
    });

    it('alterações seguidas se acumulam', async () => {
      const user = await registerUser(app);
      await send('put', user, '/api/notification-preferences', { digestTime: '06:30' });
      await send('put', user, '/api/notification-preferences', { blockRemindersEnabled: false });

      expect(await get(user)).toMatchObject({ digestTime: '06:30', blockRemindersEnabled: false });
      expect(await prisma.notificationPreference.count({ where: { userId: user.userId } })).toBe(1);
    });

    it.each([
      ['corpo vazio', {}],
      ['antecedência fora da lista', { blockLeadMin: 20 }],
      ['hora inválida', { digestTime: '25:00' }],
      ['campo desconhecido', { userId: 'x' }],
      ['booleano inválido', { digestEnabled: 'sim' }],
    ])('rejeita %s com 400', async (_name, body) => {
      const user = await registerUser(app);
      expect((await send('put', user, '/api/notification-preferences', body)).status).toBe(400);
    });

    it('cada pessoa tem as suas', async () => {
      const [ana, bia] = [await registerUser(app), await registerUser(app)];
      await send('put', ana, '/api/notification-preferences', { blockLeadMin: 60 });

      expect((await get(bia)).blockLeadMin).toBe(15);
      expect((await get(ana)).blockLeadMin).toBe(60);
    });
  });
});
