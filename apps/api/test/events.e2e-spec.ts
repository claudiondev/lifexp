import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { eventSchema, type CalendarEvent } from '@lifexp/shared';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { bearer, createTestApp, registerUser, type TestUser } from './helpers.js';

describe('Eventos do calendário (e2e)', () => {
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

  const send = (
    method: 'post' | 'get' | 'patch' | 'delete',
    user: TestUser,
    path: string,
    body?: object,
  ) => {
    const req = request(server())[method](path).set(bearer(user));
    return body ? req.send(body) : req;
  };
  const areaOf = async (user: TestUser) =>
    (await prisma.area.findFirstOrThrow({ where: { userId: user.userId } })).id;
  const base = { title: 'Consulta', date: '2026-10-20', category: 'medical' };
  const createEvent = async (user: TestUser, body: object = {}) => {
    const res = await send('post', user, '/api/events', { ...base, ...body });
    expect(res.status).toBe(201);
    return eventSchema.parse(res.body);
  };
  const list = async (user: TestUser, from: string, to: string): Promise<CalendarEvent[]> => {
    const res = await send('get', user, `/api/events?from=${from}&to=${to}`);
    expect(res.status).toBe(200);
    return res.body.map((e: unknown) => eventSchema.parse(e));
  };

  describe('autenticação', () => {
    it.each([
      ['get', '/api/events?from=2026-10-01&to=2026-10-31'],
      ['post', '/api/events'],
      ['get', '/api/events/0192f1a0-7b3c-7000-8000-0000000000c1'],
      ['patch', '/api/events/0192f1a0-7b3c-7000-8000-0000000000c1'],
      ['delete', '/api/events/0192f1a0-7b3c-7000-8000-0000000000c1'],
    ] as const)('%s %s exige login', async (method, path) => {
      expect((await request(server())[method](path)).status).toBe(401);
    });
  });

  describe('criar', () => {
    it('cria com os padrões: dia todo, sem área e lembrete de 1 dia antes (RN24)', async () => {
      const user = await registerUser(app);
      const event = await createEvent(user);

      expect(event).toMatchObject({
        title: 'Consulta',
        notes: null,
        areaId: null,
        date: '2026-10-20',
        time: null,
        category: 'medical',
        remindBeforeMin: 1440,
      });
    });

    it('cria completo: hora, notas, área e lembrete próprio', async () => {
      const user = await registerUser(app);
      const areaId = await areaOf(user);
      const event = await createEvent(user, {
        title: '  Dentista ',
        notes: 'Levar exames',
        areaId,
        time: '14:30',
        remindBeforeMin: 15,
      });

      expect(event).toMatchObject({
        title: 'Dentista',
        notes: 'Levar exames',
        areaId,
        time: '14:30',
        remindBeforeMin: 15,
      });
    });

    it('lembrete nulo significa "sem lembrete" (não vira o padrão)', async () => {
      const user = await registerUser(app);
      expect((await createEvent(user, { remindBeforeMin: null })).remindBeforeMin).toBeNull();
    });

    it('não gera XP nem lançamento no livro-caixa (RN23)', async () => {
      const user = await registerUser(app);
      await createEvent(user);
      await createEvent(user, { time: '09:00', remindBeforeMin: 0 });

      expect(await prisma.xpTransaction.count({ where: { userId: user.userId } })).toBe(0);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.userId } })).cachedTotalXp,
      ).toBe(0);
    });

    it.each([
      ['título vazio', { title: ' ' }],
      ['categoria desconhecida', { category: 'party' }],
      ['sem categoria', { category: undefined }],
      ['data inválida', { date: '2026-02-30' }],
      ['hora inválida', { time: '25:00' }],
      ['antecedência fora da lista', { time: '10:00', remindBeforeMin: 5 }],
      ['dia todo com lembrete em minutos', { remindBeforeMin: 60 }],
      ['campo desconhecido', { xp: 10 }],
      ['áreaId que não é uuid', { areaId: 'abc' }],
    ])('rejeita %s com 400', async (_name, override) => {
      const user = await registerUser(app);
      expect((await send('post', user, '/api/events', { ...base, ...override })).status).toBe(400);
    });

    it('área de outra pessoa ou inexistente responde 404 (RS06)', async () => {
      const [ana, bia] = [await registerUser(app), await registerUser(app)];
      const foreign = await areaOf(bia);

      expect((await send('post', ana, '/api/events', { ...base, areaId: foreign })).status).toBe(
        404,
      );
      expect(
        (
          await send('post', ana, '/api/events', {
            ...base,
            areaId: '0192f1a0-7b3c-7000-8000-0000000000ff',
          })
        ).status,
      ).toBe(404);
      expect(await prisma.calendarEvent.count({ where: { userId: ana.userId } })).toBe(0);
    });

    it('área arquivada responde 409', async () => {
      const user = await registerUser(app);
      const areaId = await areaOf(user);
      await send('post', user, `/api/areas/${areaId}/archive`);

      const res = await send('post', user, '/api/events', { ...base, areaId });
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/arquivada/);
    });
  });

  describe('listar por período', () => {
    it('traz só os eventos do intervalo (inclusive nas pontas), em ordem cronológica', async () => {
      const user = await registerUser(app);
      const before = await createEvent(user, { title: 'Antes', date: '2026-09-30' });
      const first = await createEvent(user, {
        title: 'Primeiro dia',
        date: '2026-10-01',
        time: '18:00',
      });
      const allDay = await createEvent(user, { title: 'Dia todo', date: '2026-10-01' });
      const last = await createEvent(user, { title: 'Último dia', date: '2026-10-31' });
      const after = await createEvent(user, { title: 'Depois', date: '2026-11-01' });

      const events = await list(user, '2026-10-01', '2026-10-31');

      expect(events.map((e) => e.id)).toEqual([allDay.id, first.id, last.id]);
      expect(events.map((e) => e.id)).not.toContain(before.id);
      expect(events.map((e) => e.id)).not.toContain(after.id);
    });

    it('um dia só e período vazio funcionam', async () => {
      const user = await registerUser(app);
      const event = await createEvent(user, { date: '2026-10-20' });

      expect((await list(user, '2026-10-20', '2026-10-20')).map((e) => e.id)).toEqual([event.id]);
      expect(await list(user, '2026-12-01', '2026-12-31')).toEqual([]);
    });

    it('nunca mistura eventos de outra pessoa', async () => {
      const [ana, bia] = [await registerUser(app), await registerUser(app)];
      const mine = await createEvent(ana, { title: 'Meu' });
      await createEvent(bia, { title: 'Da Bia' });

      expect((await list(ana, '2026-10-01', '2026-10-31')).map((e) => e.id)).toEqual([mine.id]);
    });

    it('a data é civil: não muda com o fuso da pessoa', async () => {
      const user = await registerUser(app);
      await send('patch', user, '/api/users/me', { timezone: 'Pacific/Kiritimati' });
      const event = await createEvent(user, { date: '2026-10-20', time: '23:30' });

      expect(event.date).toBe('2026-10-20');
      expect((await list(user, '2026-10-20', '2026-10-20'))[0]!.time).toBe('23:30');
    });

    it.each([
      ['fim antes do início', 'from=2026-10-02&to=2026-10-01'],
      ['mais de 93 dias', 'from=2026-10-01&to=2027-01-02'],
      ['data inválida', 'from=2026-02-30&to=2026-03-10'],
      ['sem o fim', 'from=2026-10-01'],
      ['sem parâmetros', ''],
    ])('rejeita %s com 400', async (_name, query) => {
      const user = await registerUser(app);
      expect((await send('get', user, `/api/events?${query}`)).status).toBe(400);
    });

    it('aceita exatamente 93 dias', async () => {
      const user = await registerUser(app);
      expect((await send('get', user, '/api/events?from=2026-10-01&to=2027-01-01')).status).toBe(
        200,
      );
    });
  });

  describe('detalhe', () => {
    it('devolve o evento; alheio ou inexistente é 404; id inválido é 400', async () => {
      const [ana, bia] = [await registerUser(app), await registerUser(app)];
      const event = await createEvent(bia);

      expect((await send('get', bia, `/api/events/${event.id}`)).body.id).toBe(event.id);
      expect((await send('get', ana, `/api/events/${event.id}`)).status).toBe(404);
      expect(
        (await send('get', ana, '/api/events/0192f1a0-7b3c-7000-8000-0000000000ff')).status,
      ).toBe(404);
      expect((await send('get', ana, '/api/events/abc')).status).toBe(400);
    });
  });

  describe('editar', () => {
    it('altera só o que foi enviado', async () => {
      const user = await registerUser(app);
      const event = await createEvent(user, { time: '10:00', notes: 'x', remindBeforeMin: 60 });

      const res = await send('patch', user, `/api/events/${event.id}`, { title: 'Novo título' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        title: 'Novo título',
        time: '10:00',
        notes: 'x',
        remindBeforeMin: 60,
        date: '2026-10-20',
        category: 'medical',
      });
    });

    it('muda data, categoria e área; limpa notas e área com nulo', async () => {
      const user = await registerUser(app);
      const areaId = await areaOf(user);
      const event = await createEvent(user, { notes: 'x', areaId });

      const moved = await send('patch', user, `/api/events/${event.id}`, {
        date: '2026-10-25',
        category: 'trip',
        notes: null,
        areaId: null,
      });

      expect(moved.body).toMatchObject({
        date: '2026-10-25',
        category: 'trip',
        notes: null,
        areaId: null,
      });
    });

    it('define e remove a hora, ajustando o lembrete junto', async () => {
      const user = await registerUser(app);
      const event = await createEvent(user);

      const timed = await send('patch', user, `/api/events/${event.id}`, {
        time: '09:00',
        remindBeforeMin: 15,
      });
      expect(timed.body).toMatchObject({ time: '09:00', remindBeforeMin: 15 });

      const allDay = await send('patch', user, `/api/events/${event.id}`, {
        time: null,
        remindBeforeMin: 1440,
      });
      expect(allDay.body).toMatchObject({ time: null, remindBeforeMin: 1440 });
    });

    it('tirar a hora e o lembrete juntos (lembrete nulo) é aceito', async () => {
      const user = await registerUser(app);
      const event = await createEvent(user, { time: '09:00', remindBeforeMin: 60 });

      const res = await send('patch', user, `/api/events/${event.id}`, {
        time: null,
        remindBeforeMin: null,
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ time: null, remindBeforeMin: null });
    });

    it('tirar a hora de um evento com lembrete em minutos é 400 (valida o resultado final)', async () => {
      const user = await registerUser(app);
      const event = await createEvent(user, { time: '09:00', remindBeforeMin: 60 });

      const res = await send('patch', user, `/api/events/${event.id}`, { time: null });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/lembrete em dias/);
      expect((await send('get', user, `/api/events/${event.id}`)).body.time).toBe('09:00');
    });

    it('trocar só o lembrete de um evento sem hora para minutos é 400', async () => {
      const user = await registerUser(app);
      const event = await createEvent(user);

      expect(
        (await send('patch', user, `/api/events/${event.id}`, { remindBeforeMin: 15 })).status,
      ).toBe(400);
    });

    it('rejeita corpo vazio, campo desconhecido e valores inválidos', async () => {
      const user = await registerUser(app);
      const event = await createEvent(user);
      const patch = (body: object) => send('patch', user, `/api/events/${event.id}`, body);

      expect((await patch({})).status).toBe(400);
      expect((await patch({ xp: 1 })).status).toBe(400);
      expect((await patch({ title: ' ' })).status).toBe(400);
      expect((await patch({ category: 'party' })).status).toBe(400);
    });

    it('evento alheio responde 404 e não é alterado', async () => {
      const [ana, bia] = [await registerUser(app), await registerUser(app)];
      const event = await createEvent(ana);

      expect(
        (await send('patch', bia, `/api/events/${event.id}`, { title: 'Invadido' })).status,
      ).toBe(404);
      expect((await send('get', ana, `/api/events/${event.id}`)).body.title).toBe('Consulta');
    });

    it('troca a área só por uma área própria e ativa', async () => {
      const [ana, bia] = [await registerUser(app), await registerUser(app)];
      const event = await createEvent(ana);

      expect(
        (await send('patch', ana, `/api/events/${event.id}`, { areaId: await areaOf(bia) })).status,
      ).toBe(404);
      const own = await areaOf(ana);
      expect(
        (await send('patch', ana, `/api/events/${event.id}`, { areaId: own })).body.areaId,
      ).toBe(own);
    });
  });

  describe('excluir', () => {
    it('exclui e é idempotente', async () => {
      const user = await registerUser(app);
      const event = await createEvent(user);

      expect((await send('delete', user, `/api/events/${event.id}`)).status).toBe(204);
      expect((await send('get', user, `/api/events/${event.id}`)).status).toBe(404);
      expect((await send('delete', user, `/api/events/${event.id}`)).status).toBe(204);
    });

    it('excluir o evento de outra pessoa não faz nada', async () => {
      const [ana, bia] = [await registerUser(app), await registerUser(app)];
      const event = await createEvent(ana);

      expect((await send('delete', bia, `/api/events/${event.id}`)).status).toBe(204);
      expect((await send('get', ana, `/api/events/${event.id}`)).status).toBe(200);
    });
  });
});
