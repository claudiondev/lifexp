import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { reviewDetailSchema, reviewPageSchema, weeklyReviewSchema } from '@lifexp/shared';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  FakeClock,
  bearer,
  createTestApp,
  listActivities,
  registerUser,
  type TestUser,
} from './helpers.js';

const NOON = '2026-10-07T15:00:00.000Z'; // quarta 12:00 em São Paulo; semana atual = 2026-10-05
const WEEK = '2026-10-05';

describe('Revisão semanal (e2e, RF46)', () => {
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

  const send = (
    method: 'get' | 'put' | 'post' | 'patch' | 'delete',
    user: TestUser,
    path: string,
    body?: object,
  ) => {
    const req = request(server())[method](path).set(bearer(user));
    return body ? req.send(body) : req;
  };
  const detail = async (user: TestUser, week = WEEK) => {
    const res = await send('get', user, `/api/reviews/${week}`);
    expect(res.status).toBe(200);
    return reviewDetailSchema.parse(res.body);
  };
  const save = (user: TestUser, week: string, body: object) =>
    send('put', user, `/api/reviews/${week}`, body);
  const text = (over: object = {}) => ({
    wins: 'Corri 3 vezes',
    blockers: 'Choveu',
    nextPriority: 'Entregar o relatório',
    ...over,
  });

  /** Pessoa nova + as atividades padrão por nome da área. */
  const setup = async () => {
    const user = await registerUser(app);
    const activities = await listActivities(app, user);
    const by = (name: string) => activities.find((a) => a.name === name)!;
    return { user, by };
  };
  const onceBlock = (
    user: TestUser,
    activityId: string,
    date: string,
    startTime: string,
    durationMin: number,
  ) =>
    send('post', user, '/api/blocks', {
      recurrence: 'once',
      activityId,
      date,
      startTime,
      durationMin,
    });
  const complete = (user: TestUser, blockId: string, date: string) =>
    send('post', user, `/api/blocks/${blockId}/occurrences/${date}/completion`);
  const undo = (user: TestUser, blockId: string, date: string) =>
    send('delete', user, `/api/blocks/${blockId}/occurrences/${date}/completion`);
  const skip = (user: TestUser, blockId: string, date: string) =>
    send('put', user, `/api/blocks/${blockId}/exceptions/${date}`, { type: 'skip' });
  const block = async (
    user: TestUser,
    activityId: string,
    date: string,
    start: string,
    min: number,
  ) => (await onceBlock(user, activityId, date, start, min)).body.id as string;

  it('exige autenticação nas três rotas', async () => {
    expect((await request(server()).get('/api/reviews')).status).toBe(401);
    expect((await request(server()).get(`/api/reviews/${WEEK}`)).status).toBe(401);
    expect((await request(server()).put(`/api/reviews/${WEEK}`).send(text())).status).toBe(401);
  });

  describe('resumo de aderência', () => {
    it('semana sem nada: zeros, aderência nula e nenhuma área', async () => {
      const { user } = await setup();
      const { summary, review, previousPriority } = await detail(user);
      expect(summary).toEqual({
        weekStart: WEEK,
        weekEnd: '2026-10-11',
        totals: {
          planned: 0,
          completed: 0,
          plannedMin: 0,
          completedMin: 0,
          skipped: 0,
          adherence: null,
          xp: 0,
        },
        areas: [],
      });
      expect(review).toBeNull();
      expect(previousPriority).toBeNull();
    });

    it('conta planejados, cumpridos, pulados, minutos e XP, no total e por área, na ordem das áreas', async () => {
      const { user, by } = await setup();
      const work = by('Trabalho');
      const health = by('Saúde');
      const study = by('Estudo');
      const a = await block(user, work.id, '2026-10-07', '09:00', 60); // quarta, cumprido agora
      const b = await block(user, work.id, '2026-10-05', '08:00', 30); // segunda, cumprido na segunda
      await block(user, health.id, '2026-10-06', '07:00', 45); // terça, não cumprido
      await block(user, study.id, '2026-10-08', '10:00', 60); // quinta, ainda não aconteceu
      const e = await block(user, study.id, '2026-10-09', '10:00', 90); // sexta, pulado
      await skip(user, e, '2026-10-09');
      clock.set('2026-10-05T14:00:00.000Z'); // segunda 11:00 em São Paulo
      expect((await complete(user, b, '2026-10-05')).status).toBe(200);
      clock.set(NOON);
      expect((await complete(user, a, '2026-10-07')).status).toBe(200);

      const { summary } = await detail(user);

      expect(summary.totals).toEqual({
        planned: 4,
        completed: 2,
        plannedMin: 195,
        completedMin: 90,
        skipped: 1,
        adherence: 0.5,
        xp: 90,
      });
      expect(
        summary.areas.map((area) => [area.name, area.planned, area.completed, area.adherence]),
      ).toEqual([
        ['Trabalho', 2, 2, 1],
        ['Estudo', 1, 0, 0], // a quinta; a sexta foi pulada e não conta como planejada
        ['Saúde', 1, 0, 0],
      ]);
      expect(summary.areas[0]).toMatchObject({
        areaId: work.areaId,
        plannedMin: 90,
        completedMin: 90,
        color: expect.any(String),
        icon: expect.any(String),
      });
    });

    it('pular uma ocorrência nunca derruba a aderência (RN11)', async () => {
      const { user, by } = await setup();
      const a = await block(user, by('Trabalho').id, '2026-10-07', '09:00', 60);
      const b = await block(user, by('Trabalho').id, '2026-10-08', '09:00', 60);
      await complete(user, a, '2026-10-07');
      expect((await detail(user)).summary.totals.adherence).toBe(0.5);

      await skip(user, b, '2026-10-08');

      const { totals } = (await detail(user)).summary;
      expect(totals).toMatchObject({ planned: 1, completed: 1, skipped: 1, adherence: 1 });
    });

    it('desfazer a conclusão tira o bloco dos cumpridos e o XP volta a zero', async () => {
      const { user, by } = await setup();
      const a = await block(user, by('Trabalho').id, '2026-10-07', '09:00', 60);
      await complete(user, a, '2026-10-07');
      expect((await detail(user)).summary.totals).toMatchObject({ completed: 1, xp: 60 });

      await undo(user, a, '2026-10-07');

      expect((await detail(user)).summary.totals).toMatchObject({
        planned: 1,
        completed: 0,
        xp: 0,
        adherence: 0,
      });
    });

    it('bloco semanal aparece em todas as semanas, e cada semana é uma conta separada', async () => {
      const { user, by } = await setup();
      await send('post', user, '/api/blocks', {
        recurrence: 'weekly',
        activityId: by('Saúde').id,
        weekday: 2,
        startTime: '07:00',
        durationMin: 30,
        validFrom: '2026-09-01',
      });
      expect((await detail(user, WEEK)).summary.totals.planned).toBe(1);
      expect((await detail(user, '2026-09-28')).summary.totals.planned).toBe(1);
      expect((await detail(user, '2026-08-24')).summary.totals.planned).toBe(0); // antes do início
    });

    it('uma ocorrência movida de dia continua contando na sua semana e liga a conclusão pela data original', async () => {
      const { user, by } = await setup();
      const weekly = (
        await send('post', user, '/api/blocks', {
          recurrence: 'weekly',
          activityId: by('Trabalho').id,
          weekday: 3,
          startTime: '09:00',
          durationMin: 60,
          validFrom: '2026-09-01',
        })
      ).body.id;
      await send('put', user, `/api/blocks/${weekly}/exceptions/2026-10-07`, {
        type: 'override',
        newDate: '2026-10-06',
      });
      expect((await complete(user, weekly, '2026-10-07')).status).toBe(200);

      const { totals } = (await detail(user)).summary;
      expect(totals).toMatchObject({ planned: 1, completed: 1, adherence: 1 });
    });

    it('uma área arquivada continua no resumo da semana em que tinha blocos', async () => {
      const { user, by } = await setup();
      const health = by('Saúde');
      await block(user, health.id, '2026-10-06', '07:00', 45);
      await send('post', user, `/api/areas/${health.areaId}/archive`);

      const { summary } = await detail(user);
      expect(summary.areas.map((area) => area.name)).toEqual(['Saúde']);
    });

    it('o XP da semana é líquido e respeita as bordas da semana no fuso da pessoa', async () => {
      const { user } = await setup();
      const make = (createdAt: string, amount: number) =>
        prisma.xpTransaction.create({
          data: { userId: user.userId, amount, type: 'COMPLETION', createdAt: new Date(createdAt) },
        });
      // semana de São Paulo: [2026-10-05T03:00Z, 2026-10-12T03:00Z)
      await make('2026-10-05T02:59:59.999Z', 100); // antes (domingo à noite)
      await make('2026-10-05T03:00:00.000Z', 1); // exatamente o início: entra
      await make('2026-10-12T02:59:59.999Z', 2); // último instante: entra
      await make('2026-10-12T03:00:00.000Z', 200); // exatamente o fim: já é a semana seguinte
      expect((await detail(user)).summary.totals.xp).toBe(3);

      // outro fuso, outra janela: [2026-10-04T15:00Z, 2026-10-11T15:00Z) em Tóquio
      await send('patch', user, '/api/users/me', { timezone: 'Asia/Tokyo' });
      await make('2026-10-04T16:00:00.000Z', 7); // fora para São Paulo, dentro para Tóquio
      expect((await detail(user)).summary.totals.xp).toBe(100 + 1 + 7); // as 4 linhas, recontadas em Tóquio
    });

    it('o XP de outra pessoa não entra na conta (RS06)', async () => {
      const [a, b] = [await setup(), await setup()];
      const blockId = await block(b.user, b.by('Trabalho').id, '2026-10-07', '09:00', 60);
      await complete(b.user, blockId, '2026-10-07');
      expect((await detail(a.user)).summary.totals).toMatchObject({ xp: 0, planned: 0 });
      expect((await detail(b.user)).summary.totals).toMatchObject({ xp: 60, planned: 1 });
    });

    it('o número de consultas não cresce com a quantidade de blocos (RNF04)', async () => {
      const { user, by } = await setup();
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
        await detail(user);
        counting = false;
        return queries.length;
      };
      await block(user, by('Trabalho').id, '2026-10-07', '09:00', 60);
      const withOne = await countFor();
      for (let day = 0; day < 6; day += 1) {
        await block(user, by('Estudo').id, `2026-10-0${5 + day}`, '10:00', 30);
      }
      expect(await countFor()).toBe(withOne);
      expect(withOne).toBeLessThanOrEqual(7);
    });
  });

  describe('a reflexão', () => {
    it('salva e devolve os três campos, e a tela passa a trazê-los', async () => {
      const { user } = await setup();

      const res = await save(user, WEEK, text());

      expect(res.status).toBe(200);
      expect(weeklyReviewSchema.parse(res.body)).toEqual({
        weekStart: WEEK,
        wins: 'Corri 3 vezes',
        blockers: 'Choveu',
        nextPriority: 'Entregar o relatório',
        updatedAt: NOON,
      });
      expect((await detail(user)).review).toEqual(res.body);
    });

    it('salvar de novo substitui o texto e muda a data de atualização, mas não a de criação; não duplica', async () => {
      const { user } = await setup();
      await save(user, WEEK, text());
      clock.set('2026-10-08T15:00:00.000Z');

      const res = await save(
        user,
        WEEK,
        text({ wins: 'Só 2 vezes', blockers: '', nextPriority: '' }),
      );

      expect(res.body).toMatchObject({
        wins: 'Só 2 vezes',
        blockers: '',
        nextPriority: '',
        updatedAt: '2026-10-08T15:00:00.000Z',
      });
      const rows = await prisma.weeklyReview.findMany({ where: { userId: user.userId } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.createdAt.toISOString()).toBe(NOON);
    });

    it('é idempotente: o mesmo corpo duas vezes dá o mesmo resultado', async () => {
      const { user } = await setup();
      const first = await save(user, WEEK, text());
      const second = await save(user, WEEK, text());
      expect(second.body).toEqual(first.body);
      expect(await prisma.weeklyReview.count({ where: { userId: user.userId } })).toBe(1);
    });

    it('apara espaços nas pontas e aceita campos vazios', async () => {
      const { user } = await setup();
      const res = await save(user, WEEK, { wins: '  ok  ', blockers: '', nextPriority: '\n x \n' });
      expect(res.body).toMatchObject({ wins: 'ok', blockers: '', nextPriority: 'x' });
    });

    it('guarda texto com acentos, quebras de linha e markdown como veio (sem alterar)', async () => {
      const { user } = await setup();
      const wins = 'Terminei o relatório ✅\n- corri 5 km\n- li "Sapiens"\n\n**Foco** na próxima';
      await save(user, WEEK, text({ wins }));
      expect((await detail(user)).review?.wins).toBe(wins);
    });

    it('cada campo aceita até 2000 caracteres; 2001 é recusado (400) e nada é gravado', async () => {
      const { user } = await setup();
      expect((await save(user, WEEK, text({ wins: 'x'.repeat(2000) }))).status).toBe(200);
      for (const field of ['wins', 'blockers', 'nextPriority']) {
        const res = await save(user, '2026-09-28', text({ [field]: 'x'.repeat(2001) }));
        expect([field, res.status]).toEqual([field, 400]);
      }
      expect(
        await prisma.weeklyReview.count({
          where: { userId: user.userId, weekStart: new Date('2026-09-28T00:00:00.000Z') },
        }),
      ).toBe(0);
    });

    it('rejeita corpo inválido: campo faltando, tipo errado, campos extras', async () => {
      const { user } = await setup();
      const bodies: [string, object][] = [
        ['sem wins', { blockers: '', nextPriority: '' }],
        ['sem corpo', {}],
        ['número', text({ wins: 5 })],
        ['userId no corpo', text({ userId: 'outro' })],
        ['weekStart no corpo', text({ weekStart: '2026-09-28' })],
        ['null', text({ blockers: null })],
      ];
      for (const [label, body] of bodies) {
        expect([label, (await save(user, WEEK, body)).status]).toEqual([label, 400]);
      }
      expect(await prisma.weeklyReview.count({ where: { userId: user.userId } })).toBe(0);
    });

    it('rejeita semana que não é segunda-feira, data inexistente e texto (400), sem lançar 500', async () => {
      const { user } = await setup();
      for (const week of ['2026-10-06', '2026-10-11', '2026-02-30', 'hoje', '2026-1-5']) {
        expect([week, (await save(user, week, text())).status]).toEqual([week, 400]);
        expect([week, (await send('get', user, `/api/reviews/${week}`)).status]).toEqual([
          week,
          400,
        ]);
      }
    });

    it('só dá para revisar a semana atual e as passadas; semana futura é 400 (GET e PUT)', async () => {
      const { user } = await setup();
      expect((await send('get', user, `/api/reviews/${WEEK}`)).status).toBe(200); // a atual
      expect((await save(user, WEEK, text())).status).toBe(200);
      expect((await send('get', user, '/api/reviews/2026-09-28')).status).toBe(200); // passada
      expect((await send('get', user, '/api/reviews/2020-01-06')).status).toBe(200); // bem antiga

      const futureGet = await send('get', user, '/api/reviews/2026-10-12');
      const futurePut = await save(user, '2026-10-12', text());
      expect(futureGet.status).toBe(400);
      expect(futurePut.status).toBe(400);
      expect(futureGet.body.message).toContain('ainda não começou');
      expect(
        await prisma.weeklyReview.count({
          where: { userId: user.userId, weekStart: new Date('2026-10-12T00:00:00.000Z') },
        }),
      ).toBe(0);
    });

    it('"semana atual" é a do fuso da pessoa: perto da virada, depende de onde ela está', async () => {
      const [saoPaulo, kiritimati] = [await setup(), await setup()];
      await send('patch', kiritimati.user, '/api/users/me', { timezone: 'Pacific/Kiritimati' }); // UTC+14
      clock.set('2026-10-11T12:00:00.000Z'); // domingo 09:00 em São Paulo; segunda 02:00 em Kiritimati

      expect((await send('get', saoPaulo.user, '/api/reviews/2026-10-12')).status).toBe(400);
      expect((await send('get', kiritimati.user, '/api/reviews/2026-10-12')).status).toBe(200);
    });

    it('cada pessoa tem a própria revisão da mesma semana (RS06)', async () => {
      const [a, b] = [await setup(), await setup()];
      await save(a.user, WEEK, text({ wins: 'da Ana' }));
      expect((await detail(b.user)).review).toBeNull();

      await save(b.user, WEEK, text({ wins: 'da Bia' }));

      expect((await detail(a.user)).review?.wins).toBe('da Ana');
      expect((await detail(b.user)).review?.wins).toBe('da Bia');
    });

    it('a prioridade da semana anterior aparece na semana seguinte', async () => {
      const { user } = await setup();
      await save(user, '2026-09-28', text({ nextPriority: 'Fechar o TCC' }));

      const week = await detail(user, WEEK);
      expect(week.previousPriority).toBe('Fechar o TCC');
      expect(week.review).toBeNull();
      // só a semana imediatamente seguinte herda a prioridade
      expect((await detail(user, '2026-09-28')).previousPriority).toBeNull();
    });

    it('prioridade em branco na semana anterior não vira aviso na seguinte', async () => {
      const { user } = await setup();
      await save(user, '2026-09-28', text({ nextPriority: '' }));
      expect((await detail(user, WEEK)).previousPriority).toBeNull();
    });

    it('a prioridade de outra pessoa não vaza (RS06)', async () => {
      const [a, b] = [await setup(), await setup()];
      await save(a.user, '2026-09-28', text({ nextPriority: 'segredo da Ana' }));
      expect((await detail(b.user, WEEK)).previousPriority).toBeNull();
    });
  });

  describe('GET /reviews (histórico)', () => {
    const weeks = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', WEEK];
    const seed = async (user: TestUser) => {
      for (const week of weeks) await save(user, week, text({ nextPriority: `Foco ${week}` }));
    };
    const page = async (user: TestUser, query = '') => {
      const res = await send('get', user, `/api/reviews${query}`);
      expect(res.status).toBe(200);
      return reviewPageSchema.parse(res.body);
    };

    it('conta nova: lista vazia, sem próxima página', async () => {
      const { user } = await setup();
      expect(await page(user)).toEqual({ items: [], nextCursor: null });
    });

    it('lista da mais recente à mais antiga, com a prioridade de cada semana', async () => {
      const { user } = await setup();
      await seed(user);
      const { items } = await page(user);
      expect(items.map((item) => item.weekStart)).toEqual([...weeks].reverse());
      expect(items[0]).toEqual({ weekStart: WEEK, nextPriority: `Foco ${WEEK}`, updatedAt: NOON });
    });

    it('pagina por cursor sem repetir nem pular semanas (RNF08)', async () => {
      const { user } = await setup();
      await seed(user);
      const expected = [...weeks].reverse();

      const first = await page(user, '?limit=2');
      expect(first.items.map((i) => i.weekStart)).toEqual(expected.slice(0, 2));
      expect(first.nextCursor).toBe(expected[1]);
      const second = await page(user, `?limit=2&before=${first.nextCursor}`);
      expect(second.items.map((i) => i.weekStart)).toEqual(expected.slice(2, 4));
      const third = await page(user, `?limit=2&before=${second.nextCursor}`);
      expect(third.items.map((i) => i.weekStart)).toEqual(expected.slice(4));
      expect(third.nextCursor).toBeNull();
    });

    it('uma página exatamente cheia no fim não promete outra', async () => {
      const { user } = await setup();
      await seed(user);
      const { items, nextCursor } = await page(user, '?limit=5');
      expect(items).toHaveLength(5);
      expect(nextCursor).toBeNull();
    });

    it('revisão sem nenhum texto não aparece no histórico', async () => {
      const { user } = await setup();
      await save(user, '2026-09-28', text());
      await save(user, WEEK, { wins: '', blockers: '', nextPriority: '' });
      expect((await page(user)).items.map((i) => i.weekStart)).toEqual(['2026-09-28']);
      // basta um dos três campos para existir
      await save(user, WEEK, { wins: 'algo', blockers: '', nextPriority: '' });
      expect((await page(user)).items.map((i) => i.weekStart)).toEqual([WEEK, '2026-09-28']);
    });

    it('o limite padrão é 20 e o máximo é 50; cursor e limite inválidos dão 400', async () => {
      const { user } = await setup();
      expect((await send('get', user, '/api/reviews?limit=51')).status).toBe(400);
      expect((await send('get', user, '/api/reviews?limit=0')).status).toBe(400);
      expect((await send('get', user, '/api/reviews?before=2026-10-06')).status).toBe(400);
      expect((await send('get', user, '/api/reviews?before=abc')).status).toBe(400);
      expect((await send('get', user, '/api/reviews?limit=50')).status).toBe(200);
    });

    it('cada pessoa vê só o próprio histórico (RS06)', async () => {
      const [a, b] = [await setup(), await setup()];
      await seed(a.user);
      await save(b.user, WEEK, text({ nextPriority: 'da Bia' }));
      expect((await page(a.user)).items).toHaveLength(5);
      expect((await page(b.user)).items.map((i) => i.nextPriority)).toEqual(['da Bia']);
    });
  });
});
