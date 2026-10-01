import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { blockSchema, weekResponseSchema } from '@lifexp/shared';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { bearer, createTestApp, listActivities, registerUser, type TestUser } from './helpers.js';

describe('Blocos (e2e)', () => {
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

  /** Pessoa nova com uma atividade pronta para receber blocos. */
  const setup = async () => {
    const user = await registerUser(app);
    const [activity] = await listActivities(app, user);
    return { user, activity: activity! };
  };

  const createBlock = (user: TestUser, body: object) =>
    request(server()).post('/api/blocks').set(bearer(user)).send(body);

  const weekly = (activityId: string, overrides: object = {}) => ({
    recurrence: 'weekly',
    activityId,
    weekday: 3, // quarta
    startTime: '09:00',
    durationMin: 60,
    validFrom: '2026-10-07',
    ...overrides,
  });

  const once = (activityId: string, overrides: object = {}) => ({
    recurrence: 'once',
    activityId,
    date: '2026-10-07',
    startTime: '09:00',
    durationMin: 60,
    ...overrides,
  });

  const getWeek = (user: TestUser, weekStart: string) =>
    request(server()).get(`/api/blocks/week?weekStart=${weekStart}`).set(bearer(user));

  describe('POST /blocks', () => {
    it('exige autenticação', async () => {
      expect((await request(server()).post('/api/blocks').send({})).status).toBe(401);
    });

    it('cria um bloco semanal no contrato do schema compartilhado', async () => {
      const { user, activity } = await setup();
      const res = await createBlock(user, weekly(activity.id));

      expect(res.status).toBe(201);
      expect(blockSchema.safeParse(res.body).success).toBe(true);
      expect(res.body).toMatchObject({
        recurrence: 'weekly',
        activityId: activity.id,
        weekday: 3,
        date: null,
        startTime: '09:00',
        durationMin: 60,
        validFrom: '2026-10-07',
        validUntil: null,
      });
    });

    it('cria um bloco avulso', async () => {
      const { user, activity } = await setup();
      const res = await createBlock(user, once(activity.id));

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        recurrence: 'once',
        weekday: null,
        date: '2026-10-07',
        validFrom: null,
        validUntil: null,
      });
    });

    it('aceita blocos sobrepostos no mesmo horário (sobreposição é permitida)', async () => {
      const { user, activity } = await setup();
      expect((await createBlock(user, weekly(activity.id))).status).toBe(201);
      expect((await createBlock(user, weekly(activity.id))).status).toBe(201);

      const week = await getWeek(user, '2026-10-05');
      expect(week.body.occurrences).toHaveLength(2);
    });

    it('rejeita payload inválido com 400', async () => {
      const { user, activity } = await setup();
      const invalid: [string, object][] = [
        ['atravessa a meia-noite', weekly(activity.id, { startTime: '23:00', durationMin: 65 })],
        ['duração fora do passo de 5 min', weekly(activity.id, { durationMin: 17 })],
        ['duração menor que 15 min', weekly(activity.id, { durationMin: 10 })],
        ['duração maior que 12 h', weekly(activity.id, { startTime: '00:00', durationMin: 725 })],
        ['dia da semana 8', weekly(activity.id, { weekday: 8 })],
        ['semanal com date', weekly(activity.id, { date: '2026-10-07' })],
        ['avulso com weekday', once(activity.id, { weekday: 3 })],
        ['campo extra userId', weekly(activity.id, { userId: 'outro' })],
        ['data impossível', weekly(activity.id, { validFrom: '2026-02-30' })],
        ['horário inválido', weekly(activity.id, { startTime: '25:00' })],
        ['tipo desconhecido', { ...weekly(activity.id), recurrence: 'daily' }],
        ['sem corpo', {}],
      ];
      for (const [label, body] of invalid) {
        const res = await createBlock(user, body);
        expect([label, res.status]).toEqual([label, 400]);
      }
    });

    it('não grava nada quando o corpo é inválido', async () => {
      const { user, activity } = await setup();
      await createBlock(user, weekly(activity.id, { weekday: 9 }));
      expect(await prisma.block.count({ where: { userId: user.userId } })).toBe(0);
    });

    it('rejeita atividade de outra pessoa com 404 e não cria o bloco (RS06)', async () => {
      const a = await setup();
      const b = await registerUser(app);

      const res = await createBlock(b, weekly(a.activity.id));

      expect(res.status).toBe(404);
      expect(await prisma.block.count({ where: { activityId: a.activity.id } })).toBe(0);
    });

    it('o 404 de atividade alheia é igual ao de uma atividade inexistente', async () => {
      const a = await setup();
      const b = await registerUser(app);
      const missing = '0192f1a0-7b3c-7000-8000-000000000999';

      const foreign = await createBlock(b, weekly(a.activity.id));
      const absent = await createBlock(b, weekly(missing));

      expect(foreign.status).toBe(absent.status);
      expect(foreign.body).toEqual(absent.body);
    });

    it('rejeita atividade arquivada, ou de área arquivada, com 409', async () => {
      const { user, activity } = await setup();
      const [, second] = await listActivities(app, user);

      await request(server()).post(`/api/activities/${activity.id}/archive`).set(bearer(user));
      await request(server()).post(`/api/areas/${second!.areaId}/archive`).set(bearer(user));

      expect((await createBlock(user, weekly(activity.id))).status).toBe(409);
      expect((await createBlock(user, weekly(second!.id))).status).toBe(409);
    });
  });

  describe('GET /blocks/week', () => {
    it('exige autenticação', async () => {
      expect((await request(server()).get('/api/blocks/week?weekStart=2026-10-05')).status).toBe(
        401,
      );
    });

    it('rejeita weekStart que não é segunda-feira, inválido ou ausente com 400', async () => {
      const { user } = await setup();
      for (const weekStart of ['2026-10-06', '2026-10-11', '2026-02-30', 'hoje', '']) {
        const res = await request(server())
          .get(`/api/blocks/week?weekStart=${weekStart}`)
          .set(bearer(user));
        expect([weekStart, res.status]).toEqual([weekStart, 400]);
      }
      expect((await request(server()).get('/api/blocks/week').set(bearer(user))).status).toBe(400);
    });

    it('semana sem blocos devolve a lista vazia e o intervalo certo', async () => {
      const { user } = await setup();
      const res = await getWeek(user, '2026-10-05');

      expect(res.status).toBe(200);
      expect(weekResponseSchema.safeParse(res.body).success).toBe(true);
      expect(res.body).toEqual({ weekStart: '2026-10-05', weekEnd: '2026-10-11', occurrences: [] });
    });

    it('bloco semanal criado numa quarta aparece em todas as quartas seguintes e em nenhuma anterior', async () => {
      const { user, activity } = await setup();
      const created = await createBlock(user, weekly(activity.id));

      const onWeek = async (weekStart: string) => (await getWeek(user, weekStart)).body.occurrences;

      expect(await onWeek('2026-09-28')).toHaveLength(0); // semana anterior
      const first = await onWeek('2026-10-05');
      expect(first).toHaveLength(1);
      expect(first[0]).toMatchObject({
        blockId: created.body.id,
        occurrenceDate: '2026-10-07',
        date: '2026-10-07',
        startTime: '09:00',
        durationMin: 60,
        activityId: activity.id,
        areaId: activity.areaId,
        recurrence: 'weekly',
        skipped: false,
        modified: false,
      });
      expect((await onWeek('2026-10-12'))[0].date).toBe('2026-10-14');
      expect((await onWeek('2026-12-28'))[0].date).toBe('2026-12-30');
      expect((await onWeek('2030-06-03'))[0].date).toBe('2030-06-05');
    });

    it('validFrom no meio da semana corta os dias anteriores a ele', async () => {
      const { user, activity } = await setup();
      // segunda-feira, mas só vale a partir de quarta 10-07: a segunda 10-05 não conta
      await createBlock(user, weekly(activity.id, { weekday: 1, validFrom: '2026-10-07' }));

      expect((await getWeek(user, '2026-10-05')).body.occurrences).toHaveLength(0);
      expect((await getWeek(user, '2026-10-12')).body.occurrences[0].date).toBe('2026-10-12');
    });

    it('bloco avulso aparece só na semana da própria data', async () => {
      const { user, activity } = await setup();
      await createBlock(user, once(activity.id));

      expect((await getWeek(user, '2026-10-05')).body.occurrences).toHaveLength(1);
      expect((await getWeek(user, '2026-10-12')).body.occurrences).toHaveLength(0);
      expect((await getWeek(user, '2026-09-28')).body.occurrences).toHaveLength(0);
    });

    it('semana que vira o ano funciona (2026-12-28 a 2027-01-03)', async () => {
      const { user, activity } = await setup();
      await createBlock(user, weekly(activity.id, { weekday: 5, validFrom: '2026-12-01' })); // sexta
      await createBlock(user, once(activity.id, { date: '2027-01-03' })); // domingo

      const week = (await getWeek(user, '2026-12-28')).body;
      expect(week.weekEnd).toBe('2027-01-03');
      expect(week.occurrences.map((o: { date: string }) => o.date)).toEqual([
        '2027-01-01',
        '2027-01-03',
      ]);
    });

    it('ordena as ocorrências por dia e horário', async () => {
      const { user, activity } = await setup();
      await createBlock(
        user,
        weekly(activity.id, { weekday: 3, startTime: '15:00', validFrom: '2026-10-01' }),
      );
      await createBlock(
        user,
        weekly(activity.id, { weekday: 3, startTime: '08:00', validFrom: '2026-10-01' }),
      );
      await createBlock(
        user,
        weekly(activity.id, { weekday: 1, startTime: '20:00', validFrom: '2026-10-01' }),
      );

      const times = (await getWeek(user, '2026-10-05')).body.occurrences.map(
        (o: { date: string; startTime: string }) => `${o.date} ${o.startTime}`,
      );
      expect(times).toEqual(['2026-10-05 20:00', '2026-10-07 08:00', '2026-10-07 15:00']);
    });

    it('mantém visíveis os blocos de uma atividade que foi arquivada depois', async () => {
      const { user, activity } = await setup();
      await createBlock(user, weekly(activity.id));
      await request(server()).post(`/api/activities/${activity.id}/archive`).set(bearer(user));

      expect((await getWeek(user, '2026-10-05')).body.occurrences).toHaveLength(1);
    });

    it('isola os usuários: a semana de B nunca mostra blocos de A (RS06)', async () => {
      const a = await setup();
      const b = await registerUser(app);
      await createBlock(a.user, weekly(a.activity.id));
      await createBlock(a.user, once(a.activity.id));

      expect((await getWeek(a.user, '2026-10-05')).body.occurrences).toHaveLength(2);
      expect((await getWeek(b, '2026-10-05')).body.occurrences).toHaveLength(0);
    });

    it('usa um número fixo de queries, não importa quantos blocos existam (RNF04)', async () => {
      const { user, activity } = await setup();
      const queries: string[] = [];
      let counting = false;
      (prisma as unknown as { $on(e: 'query', cb: (q: { query: string }) => void): void }).$on(
        'query',
        (event) => {
          if (counting) queries.push(event.query);
        },
      );
      const countFor = async () => {
        queries.length = 0;
        counting = true;
        await getWeek(user, '2026-10-05');
        counting = false;
        return queries.length;
      };

      await createBlock(user, weekly(activity.id));
      const withOne = await countFor();
      for (let i = 0; i < 12; i++) {
        await createBlock(
          user,
          weekly(activity.id, { weekday: (i % 7) + 1, validFrom: '2026-10-01' }),
        );
      }
      const withMany = await countFor();

      expect(withOne).toBeGreaterThan(0);
      expect(withMany).toBe(withOne);
      expect(withOne).toBe(1); // blocos, exceções e área vêm juntos, numa única consulta
    });
  });
});
