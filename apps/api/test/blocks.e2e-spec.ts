import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { addDays, blockSchema, weekResponseSchema, type Occurrence } from '@lifexp/shared';
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

  // ---------------------------------------------------------------------------------------------
  // Edição e exclusão "a partir de uma data" (esta e as próximas)
  // ---------------------------------------------------------------------------------------------

  /** 14 semanas (2026-08-31 a 2026-12-06) lidas pela API real, achatadas numa lista. */
  const allOccurrences = async (user: TestUser): Promise<Occurrence[]> => {
    const weeks = Array.from({ length: 14 }, (_, index) => addDays('2026-08-31', index * 7));
    const results = await Promise.all(weeks.map((week) => getWeek(user, week)));
    return results.flatMap((res) => res.body.occurrences);
  };

  /** O que a pessoa enxerga, sem o id interno do bloco (que muda quando a série é dividida). */
  const view = (o: Occurrence) =>
    [
      o.occurrenceDate,
      o.date,
      o.startTime,
      o.durationMin,
      o.activityId,
      o.areaId,
      o.skipped,
      o.modified,
    ].join('|');

  const patchBlock = (user: TestUser, id: string, body: object) =>
    request(server()).patch(`/api/blocks/${id}`).set(bearer(user)).send(body);

  const deleteBlock = (user: TestUser, id: string, from?: string) =>
    request(server())
      .delete(`/api/blocks/${id}${from ? `?from=${from}` : ''}`)
      .set(bearer(user));

  const utc = (date: string) => new Date(`${date}T00:00:00.000Z`);

  /** Série de quartas, 09:00, desde 2026-09-02 (1ª ocorrência), com bastante passado. */
  const setupSeries = async () => {
    const { user, activity } = await setup();
    const created = await createBlock(user, weekly(activity.id, { validFrom: '2026-09-02' }));
    return { user, activity, block: created.body as { id: string } };
  };

  describe('PATCH /blocks/:id (esta e as próximas)', () => {
    it('exige autenticação', async () => {
      const res = await request(server())
        .patch('/api/blocks/0192f1a0-7b3c-7000-8000-000000000001')
        .send({ from: '2026-10-07', startTime: '10:00' });
      expect(res.status).toBe(401);
    });

    it('O PASSADO NUNCA MUDA: edita a partir de uma data e as semanas anteriores ficam idênticas', async () => {
      const { user, block } = await setupSeries();
      const original = await allOccurrences(user);

      const res = await patchBlock(user, block.id, { from: '2026-10-07', startTime: '18:00' });
      const edited = await allOccurrences(user);

      expect(res.status).toBe(200);
      expect(edited.filter((o) => o.occurrenceDate < '2026-10-07').map(view)).toEqual(
        original.filter((o) => o.occurrenceDate < '2026-10-07').map(view),
      );
      expect(original.filter((o) => o.occurrenceDate < '2026-10-07').length).toBeGreaterThanOrEqual(
        5,
      );
    });

    it('a partir da data todas as ocorrências mudam, sem perder nem duplicar nenhuma', async () => {
      const { user, block } = await setupSeries();
      const original = await allOccurrences(user);

      await patchBlock(user, block.id, { from: '2026-10-07', startTime: '18:00' });
      const edited = await allOccurrences(user);

      expect(edited.map((o) => o.occurrenceDate)).toEqual(original.map((o) => o.occurrenceDate));
      expect(
        edited
          .filter((o) => o.occurrenceDate >= '2026-10-07')
          .every((o) => o.startTime === '18:00'),
      ).toBe(true);
      expect(
        edited.filter((o) => o.occurrenceDate < '2026-10-07').every((o) => o.startTime === '09:00'),
      ).toBe(true);
    });

    it('com passado, devolve um bloco NOVO que vale a partir da data, e encerra o antigo no dia anterior', async () => {
      const { user, block } = await setupSeries();

      const res = await patchBlock(user, block.id, { from: '2026-10-07', startTime: '18:00' });

      expect(blockSchema.safeParse(res.body).success).toBe(true);
      expect(res.body.id).not.toBe(block.id);
      expect(res.body).toMatchObject({
        recurrence: 'weekly',
        weekday: 3,
        startTime: '18:00',
        validFrom: '2026-10-07',
        validUntil: null,
      });
      const old = await prisma.block.findUniqueOrThrow({ where: { id: block.id } });
      expect(old.validUntil?.toISOString().slice(0, 10)).toBe('2026-10-06');
    });

    it('a partir da primeira ocorrência edita o próprio bloco, sem criar outro', async () => {
      const { user, block } = await setupSeries();

      const res = await patchBlock(user, block.id, { from: '2026-09-02', startTime: '18:00' });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(block.id);
      expect(await prisma.block.count({ where: { userId: user.userId } })).toBe(1);
      expect((await allOccurrences(user)).every((o) => o.startTime === '18:00')).toBe(true);
    });

    it('mudar o dia da semana preserva o passado e move a série dali em diante', async () => {
      const { user, block } = await setupSeries();
      const original = await allOccurrences(user);

      await patchBlock(user, block.id, { from: '2026-10-07', weekday: 1 }); // segunda
      const edited = await allOccurrences(user);

      expect(edited.filter((o) => o.occurrenceDate < '2026-10-07').map(view)).toEqual(
        original.filter((o) => o.occurrenceDate < '2026-10-07').map(view),
      );
      const future = edited.filter((o) => o.occurrenceDate >= '2026-10-07').map((o) => o.date);
      expect(future.slice(0, 3)).toEqual(['2026-10-12', '2026-10-19', '2026-10-26']);
    });

    it('troca a atividade só dali em diante, e a área acompanha', async () => {
      const { user, activity, block } = await setupSeries();
      const other = (await listActivities(app, user)).find((a) => a.areaId !== activity.areaId)!;

      await patchBlock(user, block.id, { from: '2026-10-07', activityId: other.id });
      const edited = await allOccurrences(user);

      expect(
        edited
          .filter((o) => o.occurrenceDate < '2026-10-07')
          .every((o) => o.areaId === activity.areaId),
      ).toBe(true);
      expect(
        edited
          .filter((o) => o.occurrenceDate >= '2026-10-07')
          .every((o) => o.activityId === other.id && o.areaId === other.areaId),
      ).toBe(true);
    });

    it('as exceções futuras acompanham a série nova e as do passado ficam onde estavam', async () => {
      const { user, block } = await setupSeries();
      await prisma.blockException.createMany({
        data: [
          { blockId: block.id, occurrenceDate: utc('2026-09-16'), type: 'SKIP' }, // passado
          { blockId: block.id, occurrenceDate: utc('2026-10-14'), type: 'SKIP' }, // futuro
          {
            blockId: block.id,
            occurrenceDate: utc('2026-10-21'),
            type: 'OVERRIDE',
            newStartTime: '15:00',
          },
        ],
      });

      await patchBlock(user, block.id, { from: '2026-10-07', startTime: '18:00' });
      const edited = await allOccurrences(user);
      const at = (date: string) => edited.find((o) => o.occurrenceDate === date);

      expect(at('2026-09-16')?.skipped).toBe(true);
      expect(at('2026-10-14')?.skipped).toBe(true);
      expect(at('2026-10-21')).toMatchObject({ startTime: '15:00', modified: true });
      expect(at('2026-10-28')).toMatchObject({ startTime: '18:00', skipped: false });
    });

    it('mudar o dia da semana descarta as exceções futuras (perderam o sentido) e mantém as do passado', async () => {
      const { user, block } = await setupSeries();
      await prisma.blockException.createMany({
        data: [
          { blockId: block.id, occurrenceDate: utc('2026-09-16'), type: 'SKIP' },
          { blockId: block.id, occurrenceDate: utc('2026-10-14'), type: 'SKIP' },
        ],
      });

      await patchBlock(user, block.id, { from: '2026-10-07', weekday: 1 });

      // Conta só as exceções desta pessoa: os testes rodam em paralelo no mesmo banco.
      const ofUser = (occurrenceDate: string) =>
        prisma.blockException.count({
          where: { block: { userId: user.userId }, occurrenceDate: utc(occurrenceDate) },
        });
      expect(await ofUser('2026-10-14')).toBe(0);
      expect(await ofUser('2026-09-16')).toBe(1);
    });

    it('edição no lugar (desde a 1ª ocorrência) com mudança de dia descarta todas as exceções', async () => {
      const { user, block } = await setupSeries();
      await prisma.blockException.createMany({
        data: [
          { blockId: block.id, occurrenceDate: utc('2026-09-16'), type: 'SKIP' },
          {
            blockId: block.id,
            occurrenceDate: utc('2026-10-14'),
            type: 'OVERRIDE',
            newStartTime: '15:00',
          },
        ],
      });

      const res = await patchBlock(user, block.id, { from: '2026-09-02', weekday: 1 });

      expect(res.body.id).toBe(block.id); // no lugar, sem série nova
      expect(await prisma.blockException.count({ where: { blockId: block.id } })).toBe(0);
      expect((await allOccurrences(user)).some((o) => o.skipped || o.modified)).toBe(false);
    });

    it('edição no lugar sem mudar o dia mantém as exceções', async () => {
      const { user, block } = await setupSeries();
      await prisma.blockException.create({
        data: { blockId: block.id, occurrenceDate: utc('2026-10-14'), type: 'SKIP' },
      });

      await patchBlock(user, block.id, { from: '2026-09-02', startTime: '18:00' });

      const occurrences = await allOccurrences(user);
      expect(occurrences.find((o) => o.occurrenceDate === '2026-10-14')).toMatchObject({
        skipped: true,
        startTime: '18:00',
      });
    });

    it('edições encadeadas preservam cada trecho do histórico', async () => {
      const { user, block } = await setupSeries();
      const second = await patchBlock(user, block.id, { from: '2026-10-07', startTime: '18:00' });
      await patchBlock(user, second.body.id, { from: '2026-11-04', startTime: '07:00' });

      const occurrences = await allOccurrences(user);
      const timeOf = (date: string) =>
        occurrences.find((o) => o.occurrenceDate === date)?.startTime;
      expect([
        timeOf('2026-09-30'),
        timeOf('2026-10-07'),
        timeOf('2026-10-28'),
        timeOf('2026-11-04'),
        timeOf('2026-11-25'),
      ]).toEqual(['09:00', '18:00', '18:00', '07:00', '07:00']);
    });

    it('edita o bloco avulso no lugar, inclusive a data', async () => {
      const { user, activity } = await setup();
      const created = await createBlock(user, once(activity.id));

      const res = await patchBlock(user, created.body.id, {
        from: '2026-10-07',
        date: '2026-10-09',
        startTime: '10:30',
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: created.body.id,
        date: '2026-10-09',
        startTime: '10:30',
      });
    });

    it('rejeita campos que não se aplicam ao tipo, com 400', async () => {
      const { user, activity } = await setup();
      const avulso = await createBlock(user, once(activity.id));
      const semanal = await createBlock(user, weekly(activity.id));

      expect(
        (await patchBlock(user, avulso.body.id, { from: '2026-10-07', weekday: 2 })).status,
      ).toBe(400);
      expect(
        (await patchBlock(user, semanal.body.id, { from: '2026-10-07', date: '2026-10-09' }))
          .status,
      ).toBe(400);
    });

    it('rejeita corpo inválido com 400 e não altera nada', async () => {
      const { user, block } = await setupSeries();
      const before = await prisma.block.findMany({ where: { userId: user.userId } });

      const invalid: [string, object][] = [
        ['sem from', { startTime: '10:00' }],
        ['sem nenhuma mudança', { from: '2026-10-07' }],
        ['weekday 9', { from: '2026-10-07', weekday: 9 }],
        ['campo extra', { from: '2026-10-07', startTime: '10:00', recurrence: 'once' }],
        ['campo extra userId', { from: '2026-10-07', startTime: '10:00', userId: 'outro' }],
        ['from inválido', { from: 'amanhã', startTime: '10:00' }],
        ['atravessa a meia-noite (herdando a duração)', { from: '2026-10-07', startTime: '23:30' }],
        ['duração fora do passo', { from: '2026-10-07', durationMin: 17 }],
      ];
      for (const [label, body] of invalid) {
        const res = await patchBlock(user, block.id, body);
        expect([label, res.status]).toEqual([label, 400]);
      }
      expect(await prisma.block.findMany({ where: { userId: user.userId } })).toEqual(before);
    });

    it('rejeita editar depois do fim da série com 409', async () => {
      const { user, activity } = await setup();
      const created = await createBlock(user, weekly(activity.id, { validFrom: '2026-09-02' }));
      await deleteBlock(user, created.body.id, '2026-10-14'); // série termina em 2026-10-13

      const res = await patchBlock(user, created.body.id, {
        from: '2026-11-04',
        startTime: '18:00',
      });

      expect(res.status).toBe(409);
    });

    it('não aceita atividade de outra pessoa (404) nem arquivada (409)', async () => {
      const { user, block } = await setupSeries();
      const stranger = await setup();
      const [, second] = await listActivities(app, user);
      await request(server()).post(`/api/activities/${second!.id}/archive`).set(bearer(user));

      const foreign = await patchBlock(user, block.id, {
        from: '2026-10-07',
        activityId: stranger.activity.id,
      });
      const archived = await patchBlock(user, block.id, {
        from: '2026-10-07',
        activityId: second!.id,
      });

      expect(foreign.status).toBe(404);
      expect(archived.status).toBe(409);
    });

    it('isola os usuários: B não edita bloco de A (404), igual a um que não existe', async () => {
      const a = await setupSeries();
      const b = await registerUser(app);

      const foreign = await patchBlock(b, a.block.id, { from: '2026-10-07', startTime: '18:00' });
      const absent = await patchBlock(b, '0192f1a0-7b3c-7000-8000-000000000999', {
        from: '2026-10-07',
        startTime: '18:00',
      });

      expect(foreign.status).toBe(404);
      expect(foreign.status).toBe(absent.status);
      expect(foreign.body).toEqual(absent.body);
      expect((await allOccurrences(a.user)).every((o) => o.startTime === '09:00')).toBe(true);
    });

    it('duas edições simultâneas da mesma série não duplicam nem perdem ocorrências', async () => {
      const { user, block } = await setupSeries();
      const original = await allOccurrences(user);

      const results = await Promise.all([
        patchBlock(user, block.id, { from: '2026-10-07', startTime: '18:00' }),
        patchBlock(user, block.id, { from: '2026-10-21', startTime: '07:00' }),
      ]);
      const statuses = results.map((res) => res.status).sort();

      expect(statuses.every((status) => status === 200 || status === 409)).toBe(true);
      expect(statuses).toContain(200);
      const after = await allOccurrences(user);
      expect(after.map((o) => o.occurrenceDate)).toEqual(original.map((o) => o.occurrenceDate));
      expect(new Set(after.map((o) => o.occurrenceDate)).size).toBe(after.length);
    });
  });

  describe('DELETE /blocks/:id (esta e as próximas)', () => {
    it('exige autenticação', async () => {
      const res = await request(server()).delete(
        '/api/blocks/0192f1a0-7b3c-7000-8000-000000000001?from=2026-10-07',
      );
      expect(res.status).toBe(401);
    });

    it('encerra a série a partir da data: o passado fica e dali em diante não há mais ocorrências', async () => {
      const { user, block } = await setupSeries();
      const original = await allOccurrences(user);

      const res = await deleteBlock(user, block.id, '2026-10-07');
      const after = await allOccurrences(user);

      expect(res.status).toBe(204);
      expect(after.map(view)).toEqual(
        original.filter((o) => o.occurrenceDate < '2026-10-07').map(view),
      );
      expect(after.length).toBeGreaterThanOrEqual(5);
    });

    it('não apaga a linha da série (preserva o histórico)', async () => {
      const { user, block } = await setupSeries();
      await deleteBlock(user, block.id, '2026-10-07');
      expect(await prisma.block.count({ where: { id: block.id } })).toBe(1);
    });

    it('excluir desde a primeira ocorrência encerra a série inteira, mantendo a linha', async () => {
      const { user, block } = await setupSeries();

      expect((await deleteBlock(user, block.id, '2026-09-02')).status).toBe(204);

      expect(await allOccurrences(user)).toHaveLength(0);
      expect(await prisma.block.count({ where: { id: block.id } })).toBe(1);
    });

    it('data de corte antes do início respeita o limite do banco (validFrom - 1)', async () => {
      const { user, block } = await setupSeries();
      expect((await deleteBlock(user, block.id, '2026-01-01')).status).toBe(204);
      expect(await allOccurrences(user)).toHaveLength(0);
    });

    it('descarta as exceções a partir da data e mantém as anteriores', async () => {
      const { user, block } = await setupSeries();
      await prisma.blockException.createMany({
        data: [
          { blockId: block.id, occurrenceDate: utc('2026-09-16'), type: 'SKIP' },
          { blockId: block.id, occurrenceDate: utc('2026-10-14'), type: 'SKIP' },
        ],
      });

      await deleteBlock(user, block.id, '2026-10-07');

      expect(await prisma.blockException.count({ where: { blockId: block.id } })).toBe(1);
    });

    it('é idempotente: excluir de novo, ou depois do fim, também responde 204', async () => {
      const { user, block } = await setupSeries();
      expect((await deleteBlock(user, block.id, '2026-10-07')).status).toBe(204);
      expect((await deleteBlock(user, block.id, '2026-10-07')).status).toBe(204);
      expect((await deleteBlock(user, block.id, '2027-06-01')).status).toBe(204);
    });

    it('remove o bloco avulso de vez', async () => {
      const { user, activity } = await setup();
      const created = await createBlock(user, once(activity.id));

      expect((await deleteBlock(user, created.body.id, '2026-10-07')).status).toBe(204);

      expect(await prisma.block.count({ where: { id: created.body.id } })).toBe(0);
      expect((await getWeek(user, '2026-10-05')).body.occurrences).toHaveLength(0);
    });

    it('exige `from` válido (400) e id em formato de UUID', async () => {
      const { user, block } = await setupSeries();
      expect((await deleteBlock(user, block.id)).status).toBe(400);
      expect((await deleteBlock(user, block.id, 'hoje')).status).toBe(400);
      expect((await deleteBlock(user, 'abc', '2026-10-07')).status).toBe(400);
    });

    it('isola os usuários: B não exclui bloco de A (404) e o bloco continua intacto', async () => {
      const a = await setupSeries();
      const b = await registerUser(app);
      const before = await allOccurrences(a.user);

      expect((await deleteBlock(b, a.block.id, '2026-09-02')).status).toBe(404);

      expect((await allOccurrences(a.user)).map(view)).toEqual(before.map(view));
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Exceções por ocorrência (pular, alterar só uma, restaurar)
  // ---------------------------------------------------------------------------------------------

  const putException = (user: TestUser, id: string, date: string, body: object) =>
    request(server()).put(`/api/blocks/${id}/exceptions/${date}`).set(bearer(user)).send(body);

  const removeException = (user: TestUser, id: string, date: string) =>
    request(server()).delete(`/api/blocks/${id}/exceptions/${date}`).set(bearer(user));

  const occurrenceOn = async (user: TestUser, weekStart: string, occurrenceDate: string) =>
    (await getWeek(user, weekStart)).body.occurrences.find(
      (o: Occurrence) => o.occurrenceDate === occurrenceDate,
    ) as Occurrence | undefined;

  describe('PUT/DELETE /blocks/:id/exceptions/:date', () => {
    it('exigem autenticação', async () => {
      const id = '0192f1a0-7b3c-7000-8000-000000000001';
      expect(
        (
          await request(server())
            .put(`/api/blocks/${id}/exceptions/2026-10-07`)
            .send({ type: 'skip' })
        ).status,
      ).toBe(401);
      expect(
        (await request(server()).delete(`/api/blocks/${id}/exceptions/2026-10-07`)).status,
      ).toBe(401);
    });

    describe('pular (RF17)', () => {
      it('marca só aquela ocorrência como pulada e não afeta as outras semanas', async () => {
        const { user, block } = await setupSeries();

        const res = await putException(user, block.id, '2026-10-07', { type: 'skip' });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
          blockId: block.id,
          occurrenceDate: '2026-10-07',
          type: 'skip',
          newDate: null,
          newStartTime: null,
          newDurationMin: null,
        });
        expect(await occurrenceOn(user, '2026-10-05', '2026-10-07')).toMatchObject({
          skipped: true,
          modified: false,
        });
        expect(await occurrenceOn(user, '2026-09-28', '2026-09-30')).toMatchObject({
          skipped: false,
        });
        expect(await occurrenceOn(user, '2026-10-12', '2026-10-14')).toMatchObject({
          skipped: false,
        });
      });

      it('a ocorrência pulada continua na lista, para poder ser restaurada', async () => {
        const { user, block } = await setupSeries();
        await putException(user, block.id, '2026-10-07', { type: 'skip' });
        expect((await getWeek(user, '2026-10-05')).body.occurrences).toHaveLength(1);
      });

      it('é idempotente: repetir não duplica nem dá erro', async () => {
        const { user, block } = await setupSeries();
        expect((await putException(user, block.id, '2026-10-07', { type: 'skip' })).status).toBe(
          200,
        );
        expect((await putException(user, block.id, '2026-10-07', { type: 'skip' })).status).toBe(
          200,
        );
        expect(await prisma.blockException.count({ where: { blockId: block.id } })).toBe(1);
      });

      it('funciona também em bloco avulso', async () => {
        const { user, activity } = await setup();
        const created = await createBlock(user, once(activity.id));

        expect(
          (await putException(user, created.body.id, '2026-10-07', { type: 'skip' })).status,
        ).toBe(200);
        expect(await occurrenceOn(user, '2026-10-05', '2026-10-07')).toMatchObject({
          skipped: true,
        });
      });
    });

    describe('alterar só uma ocorrência (RF49)', () => {
      it('muda o horário só daquela ocorrência', async () => {
        const { user, block } = await setupSeries();

        const res = await putException(user, block.id, '2026-10-07', {
          type: 'override',
          newStartTime: '14:30',
        });

        expect(res.status).toBe(200);
        expect(await occurrenceOn(user, '2026-10-05', '2026-10-07')).toMatchObject({
          startTime: '14:30',
          durationMin: 60,
          modified: true,
          skipped: false,
        });
        expect(await occurrenceOn(user, '2026-10-12', '2026-10-14')).toMatchObject({
          startTime: '09:00',
          modified: false,
        });
      });

      it('muda a duração', async () => {
        const { user, block } = await setupSeries();
        await putException(user, block.id, '2026-10-07', { type: 'override', newDurationMin: 90 });
        expect(await occurrenceOn(user, '2026-10-05', '2026-10-07')).toMatchObject({
          startTime: '09:00',
          durationMin: 90,
        });
      });

      it('move para outro dia da mesma semana, mantendo a data original como identidade', async () => {
        const { user, block } = await setupSeries();

        await putException(user, block.id, '2026-10-07', {
          type: 'override',
          newDate: '2026-10-11',
        }); // quarta -> domingo

        const week = (await getWeek(user, '2026-10-05')).body.occurrences as Occurrence[];
        expect(week).toHaveLength(1);
        expect(week[0]).toMatchObject({
          occurrenceDate: '2026-10-07',
          date: '2026-10-11',
          modified: true,
        });
        expect((await getWeek(user, '2026-10-12')).body.occurrences[0].date).toBe('2026-10-14');
      });

      it('combina dia, horário e duração numa única chamada', async () => {
        const { user, block } = await setupSeries();
        await putException(user, block.id, '2026-10-07', {
          type: 'override',
          newDate: '2026-10-09',
          newStartTime: '18:00',
          newDurationMin: 45,
        });
        expect(await occurrenceOn(user, '2026-10-05', '2026-10-07')).toMatchObject({
          date: '2026-10-09',
          startTime: '18:00',
          durationMin: 45,
        });
      });

      it('mover para outra semana é rejeitado (400) e nada é gravado', async () => {
        const { user, block } = await setupSeries();

        for (const newDate of ['2026-10-12', '2026-10-04', '2026-11-01']) {
          const res = await putException(user, block.id, '2026-10-07', {
            type: 'override',
            newDate,
          });
          expect([newDate, res.status]).toEqual([newDate, 400]);
        }
        expect(await prisma.blockException.count({ where: { blockId: block.id } })).toBe(0);
      });

      it('os limites da semana (segunda e domingo) são aceitos', async () => {
        const { user, block } = await setupSeries();
        expect(
          (
            await putException(user, block.id, '2026-10-07', {
              type: 'override',
              newDate: '2026-10-05',
            })
          ).status,
        ).toBe(200);
        expect(
          (
            await putException(user, block.id, '2026-10-07', {
              type: 'override',
              newDate: '2026-10-11',
            })
          ).status,
        ).toBe(200);
      });

      it('rejeita resultado que atravessa a meia-noite, considerando o que é herdado do bloco', async () => {
        const { user, block } = await setupSeries(); // 09:00, 60 min
        const lateStart = await putException(user, block.id, '2026-10-07', {
          type: 'override',
          newStartTime: '23:30',
        });
        expect(lateStart.status).toBe(400);

        const { user: user2, activity } = await setup();
        const afternoon = await createBlock(
          user2,
          weekly(activity.id, { startTime: '15:00', validFrom: '2026-09-02' }),
        );
        const longDuration = await putException(user2, afternoon.body.id, '2026-10-07', {
          type: 'override',
          newDurationMin: 720,
        });
        expect(longDuration.status).toBe(400); // 15:00 herdado + 12 h passa de 24:00
        expect(await prisma.blockException.count({ where: { blockId: afternoon.body.id } })).toBe(
          0,
        );
      });

      it('trocar de "pular" para "alterar" (e vice-versa) substitui a exceção, sem duplicar', async () => {
        const { user, block } = await setupSeries();
        await putException(user, block.id, '2026-10-07', { type: 'skip' });
        await putException(user, block.id, '2026-10-07', {
          type: 'override',
          newStartTime: '14:30',
        });

        let rows = await prisma.blockException.findMany({ where: { blockId: block.id } });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ type: 'OVERRIDE', newStartTime: '14:30' });
        expect(await occurrenceOn(user, '2026-10-05', '2026-10-07')).toMatchObject({
          skipped: false,
          startTime: '14:30',
        });

        await putException(user, block.id, '2026-10-07', { type: 'skip' });
        rows = await prisma.blockException.findMany({ where: { blockId: block.id } });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ type: 'SKIP', newStartTime: null });
      });

      it('um novo override substitui os campos do anterior em vez de acumular', async () => {
        const { user, block } = await setupSeries();
        await putException(user, block.id, '2026-10-07', {
          type: 'override',
          newStartTime: '14:30',
          newDurationMin: 90,
        });
        await putException(user, block.id, '2026-10-07', { type: 'override', newDurationMin: 30 });
        expect(await occurrenceOn(user, '2026-10-05', '2026-10-07')).toMatchObject({
          startTime: '09:00',
          durationMin: 30,
        });
      });
    });

    describe('restaurar', () => {
      it('desfaz pular e desfaz alterar, voltando ao original', async () => {
        const { user, block } = await setupSeries();
        await putException(user, block.id, '2026-10-07', { type: 'skip' });
        await putException(user, block.id, '2026-10-14', {
          type: 'override',
          newStartTime: '14:30',
        });

        expect((await removeException(user, block.id, '2026-10-07')).status).toBe(204);
        expect((await removeException(user, block.id, '2026-10-14')).status).toBe(204);

        expect(await occurrenceOn(user, '2026-10-05', '2026-10-07')).toMatchObject({
          skipped: false,
          modified: false,
          startTime: '09:00',
        });
        expect(await occurrenceOn(user, '2026-10-12', '2026-10-14')).toMatchObject({
          skipped: false,
          modified: false,
          startTime: '09:00',
        });
        expect(await prisma.blockException.count({ where: { blockId: block.id } })).toBe(0);
      });

      it('só restaura aquela data; as outras exceções ficam', async () => {
        const { user, block } = await setupSeries();
        await putException(user, block.id, '2026-10-07', { type: 'skip' });
        await putException(user, block.id, '2026-10-14', { type: 'skip' });

        await removeException(user, block.id, '2026-10-07');

        expect(await occurrenceOn(user, '2026-10-12', '2026-10-14')).toMatchObject({
          skipped: true,
        });
      });

      it('é idempotente: restaurar de novo, ou sem exceção, também responde 204', async () => {
        const { user, block } = await setupSeries();
        await putException(user, block.id, '2026-10-07', { type: 'skip' });
        expect((await removeException(user, block.id, '2026-10-07')).status).toBe(204);
        expect((await removeException(user, block.id, '2026-10-07')).status).toBe(204);
        expect((await removeException(user, block.id, '2026-10-21')).status).toBe(204);
      });
    });

    describe('validações', () => {
      it('a data precisa ser uma ocorrência real da série (404)', async () => {
        const { user, activity } = await setup();
        const bounded = await createBlock(user, weekly(activity.id, { validFrom: '2026-09-09' }));
        await deleteBlock(user, bounded.body.id, '2026-10-14'); // última ocorrência: 2026-10-07

        const notAnOccurrence: [string, string][] = [
          ['dia da semana errado (quinta)', '2026-10-01'],
          ['antes de validFrom', '2026-09-02'],
          ['depois do fim da série', '2026-10-14'],
        ];
        for (const [label, date] of notAnOccurrence) {
          const res = await putException(user, bounded.body.id, date, { type: 'skip' });
          expect([label, res.status]).toEqual([label, 404]);
        }
        expect(
          (await putException(user, bounded.body.id, '2026-09-09', { type: 'skip' })).status,
        ).toBe(200); // 1ª
        expect(
          (await putException(user, bounded.body.id, '2026-10-07', { type: 'skip' })).status,
        ).toBe(200); // última
      });

      it('bloco avulso só aceita a própria data', async () => {
        const { user, activity } = await setup();
        const created = await createBlock(user, once(activity.id));
        expect(
          (await putException(user, created.body.id, '2026-10-14', { type: 'skip' })).status,
        ).toBe(404);
        expect(
          (await putException(user, created.body.id, '2026-10-07', { type: 'skip' })).status,
        ).toBe(200);
      });

      it('rejeita data inválida e corpo inválido com 400', async () => {
        const { user, block } = await setupSeries();
        const invalid: [string, string, object][] = [
          ['data mal formada', 'amanha', { type: 'skip' }],
          ['data impossível', '2026-02-30', { type: 'skip' }],
          ['skip com campos extras', '2026-10-07', { type: 'skip', newDate: '2026-10-08' }],
          ['override vazio', '2026-10-07', { type: 'override' }],
          ['tipo desconhecido', '2026-10-07', { type: 'delete' }],
          ['horário inválido', '2026-10-07', { type: 'override', newStartTime: '99:00' }],
          ['duração fora do passo', '2026-10-07', { type: 'override', newDurationMin: 7 }],
          ['campo extra', '2026-10-07', { type: 'override', newStartTime: '10:00', userId: 'x' }],
          ['sem corpo', '2026-10-07', {}],
        ];
        for (const [label, date, body] of invalid) {
          const res = await putException(user, block.id, date, body);
          expect([label, res.status]).toEqual([label, 400]);
        }
        expect(await prisma.blockException.count({ where: { blockId: block.id } })).toBe(0);
      });

      it('rejeita id que não é UUID com 400', async () => {
        const { user } = await setupSeries();
        expect((await putException(user, 'abc', '2026-10-07', { type: 'skip' })).status).toBe(400);
        expect((await removeException(user, 'abc', '2026-10-07')).status).toBe(400);
      });
    });

    describe('isolamento entre usuários (RS06, RN39)', () => {
      it('B não pula nem altera ocorrência de bloco de A (404) e nada é gravado', async () => {
        const a = await setupSeries();
        const b = await registerUser(app);

        const skip = await putException(b, a.block.id, '2026-10-07', { type: 'skip' });
        const override = await putException(b, a.block.id, '2026-10-07', {
          type: 'override',
          newStartTime: '10:00',
        });

        expect([skip.status, override.status]).toEqual([404, 404]);
        expect(await prisma.blockException.count({ where: { blockId: a.block.id } })).toBe(0);
      });

      it('B não restaura a exceção de A (404) e ela continua valendo', async () => {
        const a = await setupSeries();
        const b = await registerUser(app);
        await putException(a.user, a.block.id, '2026-10-07', { type: 'skip' });

        expect((await removeException(b, a.block.id, '2026-10-07')).status).toBe(404);

        expect(await occurrenceOn(a.user, '2026-10-05', '2026-10-07')).toMatchObject({
          skipped: true,
        });
      });

      it('o 404 de bloco alheio é igual ao de um bloco que não existe', async () => {
        const a = await setupSeries();
        const b = await registerUser(app);
        const missing = '0192f1a0-7b3c-7000-8000-000000000999';

        const foreign = await putException(b, a.block.id, '2026-10-07', { type: 'skip' });
        const absent = await putException(b, missing, '2026-10-07', { type: 'skip' });

        expect(foreign.status).toBe(absent.status);
        expect(foreign.body).toEqual(absent.body);
      });
    });

    describe('integração com a edição da série', () => {
      it('pular uma ocorrência passada e depois editar "esta e as próximas" mantém o que foi pulado', async () => {
        const { user, block } = await setupSeries();
        await putException(user, block.id, '2026-09-16', { type: 'skip' });

        await patchBlock(user, block.id, { from: '2026-10-07', startTime: '18:00' });

        expect(await occurrenceOn(user, '2026-09-14', '2026-09-16')).toMatchObject({
          skipped: true,
          startTime: '09:00',
        });
        expect(await occurrenceOn(user, '2026-10-05', '2026-10-07')).toMatchObject({
          skipped: false,
          startTime: '18:00',
        });
      });

      it('exceção feita antes da divisão acompanha a série nova (pulada continua pulada)', async () => {
        const { user, block } = await setupSeries();
        await putException(user, block.id, '2026-10-21', { type: 'skip' });

        await patchBlock(user, block.id, { from: '2026-10-07', startTime: '18:00' });

        expect(await occurrenceOn(user, '2026-10-19', '2026-10-21')).toMatchObject({
          skipped: true,
        });
      });

      it('exceção na série encerrada, depois da exclusão, responde 404', async () => {
        const { user, block } = await setupSeries();
        await deleteBlock(user, block.id, '2026-10-07');
        expect((await putException(user, block.id, '2026-10-14', { type: 'skip' })).status).toBe(
          404,
        );
      });
    });

    describe('concorrência', () => {
      it('duas chamadas iguais ao mesmo tempo dão 200 e uma única exceção', async () => {
        const { user, block } = await setupSeries();

        const results = await Promise.all([
          putException(user, block.id, '2026-10-07', { type: 'skip' }),
          putException(user, block.id, '2026-10-07', { type: 'skip' }),
          putException(user, block.id, '2026-10-07', { type: 'skip' }),
        ]);

        expect(results.map((res) => res.status)).toEqual([200, 200, 200]);
        expect(await prisma.blockException.count({ where: { blockId: block.id } })).toBe(1);
      });

      it('pular durante a divisão da série fica consistente: uma só ocorrência por data, nada perdido', async () => {
        const { user, block } = await setupSeries();
        const original = await allOccurrences(user);

        const [skip, edit] = await Promise.all([
          putException(user, block.id, '2026-10-14', { type: 'skip' }),
          patchBlock(user, block.id, { from: '2026-10-07', startTime: '18:00' }),
        ]);

        expect([200, 404]).toContain(skip.status);
        expect(edit.status).toBe(200);
        const after = await allOccurrences(user);
        expect(after.map((o) => o.occurrenceDate)).toEqual(original.map((o) => o.occurrenceDate));
        // se o skip foi aceito antes da divisão, ele acompanhou a série nova
        const target = after.find((o) => o.occurrenceDate === '2026-10-14');
        expect(target?.skipped).toBe(skip.status === 200);
      });
    });
  });
});
