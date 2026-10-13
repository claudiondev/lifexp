import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  LEISURE_ICONS,
  MAX_LEISURE_OPTIONS,
  leisureOptionSchema,
  leisureSessionSchema,
  leisureSummarySchema,
} from '@lifexp/shared';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  FakeClock,
  bearer,
  createTestApp,
  listActivities,
  registerUser,
  type TestUser,
} from './helpers.js';

// Quarta 2026-10-07 às 12:00 em São Paulo (UTC-3). A semana é a de segunda 2026-10-05.
const NOON = '2026-10-07T15:00:00.000Z';
const WEEK = '2026-10-05';

describe('Tempo de lazer: saldo e cronômetro (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const clock = new FakeClock(NOON);
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp({ clock });
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => clock.set(NOON));

  const at = (minutes: number) =>
    new Date(new Date(NOON).getTime() + minutes * 60_000).toISOString();

  const setup = async () => {
    const user = await registerUser(app);
    const [activity] = await listActivities(app, user);
    await request(server())
      .patch(`/api/activities/${activity!.id}`)
      .set(bearer(user))
      .send({ leisurePercent: 50 });
    return { user, activity: activity! };
  };

  const createBlock = async (user: TestUser, activityId: string, overrides: object = {}) =>
    (
      await request(server())
        .post('/api/blocks')
        .set(bearer(user))
        .send({
          recurrence: 'weekly',
          activityId,
          weekday: 3,
          startTime: '09:00',
          durationMin: 120,
          validFrom: '2026-09-02',
          ...overrides,
        })
    ).body as { id: string };

  const complete = (user: TestUser, blockId: string, date = '2026-10-07') =>
    request(server())
      .post(`/api/blocks/${blockId}/occurrences/${date}/completion`)
      .set(bearer(user));
  const undo = (user: TestUser, blockId: string, date = '2026-10-07') =>
    request(server())
      .delete(`/api/blocks/${blockId}/occurrences/${date}/completion`)
      .set(bearer(user));

  /** Usuário com 60 min de lazer ganhos (bloco de 2 h a 50%) e um lazer cadastrado. */
  const withBalance = async () => {
    const ctx = await setup();
    const block = await createBlock(ctx.user, ctx.activity.id);
    await complete(ctx.user, block.id);
    const option = (await createOption(ctx.user)).body as { id: string };
    return { ...ctx, block, option };
  };

  const summary = async (user: TestUser) => {
    const res = await request(server()).get('/api/leisure').set(bearer(user));
    expect(res.status).toBe(200);
    return leisureSummarySchema.parse(res.body);
  };
  const createOption = (user: TestUser, body: object = { name: 'Instagram', icon: 'smartphone' }) =>
    request(server()).post('/api/leisure/options').set(bearer(user)).send(body);
  const patchOption = (user: TestUser, id: string, body: object) =>
    request(server()).patch(`/api/leisure/options/${id}`).set(bearer(user)).send(body);
  const start = (user: TestUser, optionId: string) =>
    request(server()).post('/api/leisure/sessions').set(bearer(user)).send({ optionId });
  const stop = (user: TestUser, id: string) =>
    request(server()).post(`/api/leisure/sessions/${id}/stop`).set(bearer(user));

  describe('segurança', () => {
    it('todas as rotas exigem autenticação', async () => {
      const id = '0192f1a0-7b3c-7000-8000-000000000001';
      const calls = [
        () => request(server()).get('/api/leisure'),
        () => request(server()).get('/api/leisure/options'),
        () => request(server()).post('/api/leisure/options').send({ name: 'x', icon: 'tv' }),
        () => request(server()).patch(`/api/leisure/options/${id}`).send({ name: 'x' }),
        () => request(server()).post('/api/leisure/sessions').send({ optionId: id }),
        () => request(server()).post(`/api/leisure/sessions/${id}/stop`),
      ];
      for (const call of calls) expect((await call()).status).toBe(401);
    });

    it('corpo com campo extra ou inválido responde 400 (RS07)', async () => {
      const { user, option } = await withBalance();
      expect((await createOption(user, { name: 'TV', icon: 'tv', userId: 'x' })).status).toBe(400);
      expect((await createOption(user, { name: 'TV', icon: 'foguete' })).status).toBe(400);
      expect((await createOption(user, { name: '  ', icon: 'tv' })).status).toBe(400);
      expect((await patchOption(user, option.id, {})).status).toBe(400);
      expect(
        (
          await request(server())
            .post('/api/leisure/sessions')
            .set(bearer(user))
            .send({ optionId: option.id, limitMin: 9999 })
        ).status,
      ).toBe(400);
      expect((await start(user, 'abc')).status).toBe(400);
    });

    it('lazer e sessão de outra pessoa respondem 404, como os que não existem (RS06)', async () => {
      const a = await withBalance();
      const b = await withBalance();
      const session = (await start(a.user, a.option.id)).body as { id: string };

      expect((await start(b.user, a.option.id)).status).toBe(404);
      expect((await patchOption(b.user, a.option.id, { name: 'Roubado' })).status).toBe(404);
      expect((await stop(b.user, session.id)).status).toBe(404);
      const row = await prisma.leisureSession.findUniqueOrThrow({ where: { id: session.id } });
      expect(row.stoppedAt).toBeNull();
    });

    it('o saldo de uma pessoa não enxerga o de outra', async () => {
      const a = await withBalance();
      const b = await setup();
      expect(await summary(a.user)).toMatchObject({ earnedMin: 60, balanceMin: 60 });
      expect(await summary(b.user)).toMatchObject({ earnedMin: 0, balanceMin: 0, byActivity: [] });
    });
  });

  describe('lazeres cadastrados', () => {
    it('cria, lista e aceita todos os ícones', async () => {
      const { user } = await setup();
      for (const icon of LEISURE_ICONS) {
        const res = await createOption(user, { name: `Lazer ${icon}`, icon });
        expect(res.status).toBe(201);
        expect(leisureOptionSchema.parse(res.body)).toMatchObject({ icon, archivedAt: null });
        if (icon === 'film') break; // mantém abaixo do limite de ativos
      }
      const list = await request(server()).get('/api/leisure/options').set(bearer(user));
      expect(list.status).toBe(200);
      expect(list.body.length).toBeGreaterThanOrEqual(3);
    });

    it('nome repetido entre ativos (sem diferenciar maiúsculas) responde 409', async () => {
      const { user } = await setup();
      await createOption(user, { name: 'TikTok', icon: 'music' });
      expect((await createOption(user, { name: 'tiktok', icon: 'tv' })).status).toBe(409);
    });

    it('renomear para um nome já usado responde 409; trocar só o ícone não conflita consigo mesmo', async () => {
      const { user } = await setup();
      const a = (await createOption(user, { name: 'TikTok', icon: 'music' })).body;
      const b = (await createOption(user, { name: 'Série', icon: 'tv' })).body;
      expect((await patchOption(user, b.id, { name: 'TIKTOK' })).status).toBe(409);
      expect((await patchOption(user, a.id, { name: 'tiktok', icon: 'play' })).status).toBe(200);
    });

    it('no máximo 20 ativos; arquivar libera espaço', async () => {
      const { user } = await setup();
      for (let i = 0; i < MAX_LEISURE_OPTIONS; i += 1) {
        expect((await createOption(user, { name: `Lazer ${i}`, icon: 'tv' })).status).toBe(201);
      }
      expect((await createOption(user, { name: 'Um a mais', icon: 'tv' })).status).toBe(409);
      const first = (await request(server()).get('/api/leisure/options').set(bearer(user))).body[0];
      await patchOption(user, first.id, { archived: true });
      expect((await createOption(user, { name: 'Um a mais', icon: 'tv' })).status).toBe(201);
      // restaurar o arquivado agora estoura o limite
      expect((await patchOption(user, first.id, { archived: false })).status).toBe(409);
    });

    it('arquivar esconde da lista (e mostra com includeArchived); restaurar volta', async () => {
      const { user } = await setup();
      const option = (await createOption(user)).body;
      const archived = await patchOption(user, option.id, { archived: true });
      expect(archived.body.archivedAt).toBe(NOON);

      const hidden = await request(server()).get('/api/leisure/options').set(bearer(user));
      expect(hidden.body).toHaveLength(0);
      const all = await request(server())
        .get('/api/leisure/options?includeArchived=true')
        .set(bearer(user));
      expect(all.body).toHaveLength(1);

      const restored = await patchOption(user, option.id, { archived: false });
      expect(restored.body.archivedAt).toBeNull();
    });

    it('restaurar um lazer cujo nome foi tomado enquanto estava arquivado responde 409', async () => {
      const { user } = await setup();
      const old = (await createOption(user)).body;
      await patchOption(user, old.id, { archived: true });
      await createOption(user); // mesmo nome, agora livre
      expect((await patchOption(user, old.id, { archived: false })).status).toBe(409);
    });
  });

  describe('saldo da semana', () => {
    it('sem nada ganho: tudo zerado, na semana de segunda', async () => {
      const { user } = await setup();
      expect(await summary(user)).toMatchObject({
        weekStart: WEEK,
        earnedMin: 0,
        usedMin: 0,
        balanceMin: 0,
        activeSession: null,
        byActivity: [],
        sessions: [],
      });
    });

    it('conta o ganho, com o nome da atividade e os minutos cumpridos', async () => {
      const { user, activity } = await withBalance();
      expect(await summary(user)).toMatchObject({
        earnedMin: 60,
        balanceMin: 60,
        byActivity: [{ activityId: activity.id, name: activity.name, doneMin: 120, earnedMin: 60 }],
      });
    });

    it('desfazer a conclusão devolve os minutos', async () => {
      const { user, block } = await withBalance();
      await undo(user, block.id);
      expect(await summary(user)).toMatchObject({ earnedMin: 0, balanceMin: 0, byActivity: [] });
    });

    it('atividade que não gera lazer não aparece', async () => {
      const { user, activity } = await setup();
      await request(server())
        .patch(`/api/activities/${activity.id}`)
        .set(bearer(user))
        .send({ leisurePercent: null });
      const block = await createBlock(user, activity.id);
      await complete(user, block.id);
      expect(await summary(user)).toMatchObject({ earnedMin: 0, byActivity: [] });
    });

    it('o ganho conta pelo instante da conclusão, não pela data do bloco', async () => {
      const { user, activity } = await setup();
      // Bloco de domingo 2026-10-11 20:00, concluído na segunda 2026-10-12 às 10:00 (a janela vai até 23:59 de segunda).
      const block = await createBlock(user, activity.id, { weekday: 7, startTime: '20:00' });
      clock.set('2026-10-12T13:00:00.000Z');
      expect((await complete(user, block.id, '2026-10-11')).status).toBe(200);

      expect(await summary(user)).toMatchObject({ weekStart: '2026-10-12', earnedMin: 60 });
      clock.set('2026-10-11T20:00:00.000Z'); // domingo à tarde: ainda a semana passada
      expect(await summary(user)).toMatchObject({ weekStart: WEEK, earnedMin: 0 });
    });

    it('zera na segunda: o que sobrou da semana passada não vale na nova', async () => {
      const { user } = await withBalance();
      expect((await summary(user)).balanceMin).toBe(60);
      clock.set('2026-10-12T15:00:00.000Z'); // segunda 12:00 em São Paulo
      expect(await summary(user)).toMatchObject({
        weekStart: '2026-10-12',
        balanceMin: 0,
        earnedMin: 0,
      });
    });

    it('segunda 00:00 local é o limite: 02:59 UTC ainda é domingo, 03:00 UTC já é segunda', async () => {
      const { user } = await withBalance();
      clock.set('2026-10-12T02:59:59.000Z');
      expect((await summary(user)).balanceMin).toBe(60);
      clock.set('2026-10-12T03:00:00.000Z');
      expect((await summary(user)).balanceMin).toBe(0);
    });
  });

  describe('cronômetro', () => {
    it('inicia com o saldo como limite e devolve a sessão', async () => {
      const { user, option } = await withBalance();
      const res = await start(user, option.id);
      expect(res.status).toBe(201);
      expect(leisureSessionSchema.parse(res.body)).toMatchObject({
        optionId: option.id,
        startedAt: NOON,
        limitMin: 60,
        stoppedAt: null,
        endsAt: at(60),
        usedMin: 0,
        active: true,
      });
      expect((await summary(user)).activeSession).toMatchObject({ id: res.body.id, active: true });
    });

    it('parar desconta o tempo real; o saldo cai e a sessão sai de ativa', async () => {
      const { user, option } = await withBalance();
      const session = (await start(user, option.id)).body;
      clock.set(at(20));
      const stopped = await stop(user, session.id);
      expect(stopped.status).toBe(200);
      expect(stopped.body).toMatchObject({ stoppedAt: at(20), usedMin: 20, active: false });
      expect(await summary(user)).toMatchObject({
        usedMin: 20,
        balanceMin: 40,
        activeSession: null,
      });
    });

    it('enquanto corre, o saldo já desconta o que passou', async () => {
      const { user, option } = await withBalance();
      await start(user, option.id);
      clock.set(at(15));
      expect(await summary(user)).toMatchObject({ usedMin: 15, balanceMin: 45 });
    });

    it('acaba sozinha no limite, sem ninguém parar: usa o saldo todo e deixa de ser ativa', async () => {
      const { user, option } = await withBalance();
      await start(user, option.id);
      clock.set(at(60 * 5));
      expect(await summary(user)).toMatchObject({
        usedMin: 60,
        balanceMin: 0,
        activeSession: null,
        sessions: [{ usedMin: 60, active: false, endsAt: at(60) }],
      });
    });

    it('parar é idempotente e não muda o fim já gravado', async () => {
      const { user, option } = await withBalance();
      const session = (await start(user, option.id)).body;
      clock.set(at(10));
      await stop(user, session.id);
      clock.set(at(30));
      const again = await stop(user, session.id);
      expect(again.status).toBe(200);
      expect(again.body).toMatchObject({ stoppedAt: at(10), usedMin: 10 });
    });

    it('parar depois do limite grava o próprio limite, nunca mais que ele', async () => {
      const { user, option } = await withBalance();
      const session = (await start(user, option.id)).body;
      clock.set(at(300));
      const stopped = await stop(user, session.id);
      expect(stopped.body).toMatchObject({ stoppedAt: at(60), usedMin: 60, active: false });
    });

    it('só uma sessão corre por vez (409); depois de parar, outra pode começar', async () => {
      const { user, option } = await withBalance();
      const first = (await start(user, option.id)).body;
      const second = await start(user, option.id);
      expect(second.status).toBe(409);
      expect(second.body.message).toMatch(/em andamento/);
      clock.set(at(10));
      await stop(user, first.id);
      const third = await start(user, option.id);
      expect(third.status).toBe(201);
      expect(third.body.limitMin).toBe(50);
    });

    it('depois de a sessão acabar no limite, não dá para começar outra sem saldo (409)', async () => {
      const { user, option } = await withBalance();
      await start(user, option.id);
      clock.set(at(120));
      const blocked = await start(user, option.id);
      expect(blocked.status).toBe(409);
      expect(blocked.body.message).toMatch(/ainda não tem tempo de lazer/);
    });

    it('sem saldo não inicia (409) e nada é gravado', async () => {
      const { user } = await setup();
      const option = (await createOption(user)).body;
      expect((await start(user, option.id)).status).toBe(409);
      expect(await prisma.leisureSession.count({ where: { userId: user.userId } })).toBe(0);
    });

    it('lazer arquivado não inicia (409)', async () => {
      const { user, option } = await withBalance();
      await patchOption(user, option.id, { archived: true });
      expect((await start(user, option.id)).status).toBe(409);
    });

    it('lazer arquivado com sessões antigas continua no histórico da semana', async () => {
      const { user, option } = await withBalance();
      const session = (await start(user, option.id)).body;
      clock.set(at(10));
      await stop(user, session.id);
      await patchOption(user, option.id, { archived: true });
      expect((await summary(user)).sessions).toHaveLength(1);
    });

    it('cinco inícios simultâneos abrem uma única sessão', async () => {
      const { user, option } = await withBalance();
      const results = await Promise.all(Array.from({ length: 5 }, () => start(user, option.id)));
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(4);
      expect(await prisma.leisureSession.count({ where: { userId: user.userId } })).toBe(1);
    });

    it('estorno depois do uso: o saldo mostrado é 0, não inicia, e não vira dívida na semana seguinte', async () => {
      const { user, block, option } = await withBalance();
      const session = (await start(user, option.id)).body;
      clock.set(at(50));
      await stop(user, session.id);

      expect((await undo(user, block.id)).status).toBe(200);
      expect(await summary(user)).toMatchObject({ earnedMin: 0, usedMin: 50, balanceMin: 0 });
      expect((await start(user, option.id)).status).toBe(409);

      clock.set('2026-10-12T15:00:00.000Z');
      expect(await summary(user)).toMatchObject({ earnedMin: 0, usedMin: 0, balanceMin: 0 });
    });

    it('uma sessão que atravessa a virada da semana não zera nem duplica: conta na semana em que começou', async () => {
      const { user, option } = await withBalance();
      // Domingo 23:30 em São Paulo (02:30 UTC de segunda), com 60 min de saldo ganho antes na semana.
      clock.set('2026-10-12T02:30:00.000Z');
      const session = (await start(user, option.id)).body;
      expect(session.limitMin).toBe(60);

      clock.set('2026-10-12T03:10:00.000Z'); // já é segunda local, a sessão ainda corre
      const next = await summary(user);
      expect(next).toMatchObject({ weekStart: '2026-10-12', usedMin: 0, balanceMin: 0 });
      expect(next.activeSession).toMatchObject({ id: session.id, active: true });
      expect((await start(user, option.id)).status).toBe(409);
    });
  });

  describe('desempenho', () => {
    it('o número de consultas do saldo não cresce com blocos, lazeres e sessões (RNF04)', async () => {
      const { user, activity, option } = await withBalance();
      const queries: string[] = [];
      let counting = false;
      (prisma as unknown as { $on(e: 'query', cb: (q: { query: string }) => void): void }).$on(
        'query',
        (event) => {
          const control = /^(BEGIN|COMMIT|SET|SHOW|DEALLOCATE)/i.test(event.query);
          if (counting && !control && !event.query.includes('"Session"')) queries.push(event.query);
        },
      );
      const countFor = async () => {
        queries.length = 0;
        counting = true;
        await summary(user);
        counting = false;
        return queries.length;
      };
      const withOne = await countFor();
      for (let day = 0; day < 4; day += 1) {
        const block = await createBlock(user, activity.id, {
          weekday: 3,
          startTime: `1${day}:00`,
          durationMin: 30,
        });
        await complete(user, block.id);
        const s = (await start(user, option.id)).body;
        clock.set(at(day + 1));
        await stop(user, s.id);
      }
      expect(await countFor()).toBe(withOne);
      expect(withOne).toBeLessThanOrEqual(5);
    });
  });
});
