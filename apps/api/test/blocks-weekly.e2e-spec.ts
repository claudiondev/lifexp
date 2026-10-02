import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  addDays,
  blockSchema,
  validUntilForWeeks,
  weekResponseSchema,
  type Occurrence,
} from '@lifexp/shared';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { bearer, createTestApp, listActivities, registerUser, type TestUser } from './helpers.js';

const MON = '2026-10-05';
const WED = '2026-10-07';

describe('Blocos: vários dias da semana e fim da série (e2e)', () => {
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

  const setup = async () => {
    const user = await registerUser(app);
    const [activity] = await listActivities(app, user);
    return { user, activity: activity! };
  };
  const send = (
    method: 'post' | 'put' | 'delete' | 'get' | 'patch',
    user: TestUser,
    path: string,
    body?: object,
  ) => {
    const req = request(server())[method](path).set(bearer(user));
    return body ? req.send(body) : req;
  };
  const createWeekly = (user: TestUser, body: object) =>
    send('post', user, '/api/blocks/weekly', body);
  const multi = (activityId: string, overrides: object = {}) => ({
    activityId,
    weekdays: [1, 3, 5],
    startTime: '09:00',
    durationMin: 60,
    validFrom: MON,
    ...overrides,
  });
  const single = (activityId: string, overrides: object = {}) => ({
    recurrence: 'weekly',
    activityId,
    weekday: 3,
    startTime: '09:00',
    durationMin: 60,
    validFrom: WED,
    ...overrides,
  });
  const week = async (user: TestUser, weekStart: string): Promise<Occurrence[]> => {
    const res = await send('get', user, `/api/blocks/week?weekStart=${weekStart}`);
    expect(res.status).toBe(200);
    return weekResponseSchema.parse(res.body).occurrences;
  };
  /** Todas as datas em que o bloco aparece, varrendo as semanas pedidas. */
  const datesOver = async (user: TestUser, from: string, weeks: number) => {
    const dates: string[] = [];
    for (let index = 0; index < weeks; index += 1) {
      for (const occurrence of await week(user, addDays(from, index * 7))) {
        dates.push(occurrence.date);
      }
    }
    return dates.sort();
  };
  const blocksOf = (user: TestUser) =>
    prisma.block.findMany({ where: { userId: user.userId }, orderBy: { weekday: 'asc' } });

  describe('POST /blocks/weekly', () => {
    it('exige autenticação', async () => {
      expect((await request(server()).post('/api/blocks/weekly').send({})).status).toBe(401);
    });

    it('cria um bloco semanal por dia marcado, de segunda a domingo, sem fim', async () => {
      const { user, activity } = await setup();

      const res = await createWeekly(user, multi(activity.id, { weekdays: [5, 1, 3] }));

      expect(res.status).toBe(201);
      expect(res.body).toHaveLength(3);
      for (const block of res.body) expect(blockSchema.safeParse(block).success).toBe(true);
      expect(res.body.map((block: { weekday: number }) => block.weekday)).toEqual([1, 3, 5]);
      expect(new Set(res.body.map((block: { id: string }) => block.id)).size).toBe(3);
      for (const block of res.body) {
        expect(block).toMatchObject({
          recurrence: 'weekly',
          activityId: activity.id,
          date: null,
          startTime: '09:00',
          durationMin: 60,
          validFrom: MON,
          validUntil: null,
          goalId: null,
        });
      }
      const stored = await blocksOf(user);
      expect(stored.map((block) => block.weekday)).toEqual([1, 3, 5]);
      expect(stored.every((block) => block.userId === user.userId)).toBe(true);
    });

    it('sem fim, as ocorrências continuam semana após semana', async () => {
      const { user, activity } = await setup();
      await createWeekly(user, multi(activity.id));

      expect(await datesOver(user, MON, 3)).toEqual([
        '2026-10-05',
        '2026-10-07',
        '2026-10-09',
        '2026-10-12',
        '2026-10-14',
        '2026-10-16',
        '2026-10-19',
        '2026-10-21',
        '2026-10-23',
      ]);
      // bem mais adiante, a série ainda existe
      expect(await week(user, '2027-03-01')).toHaveLength(3);
    });

    it('com fim, para exatamente nele: a última ocorrência no dia final ainda vale', async () => {
      const { user, activity } = await setup();
      // até sexta 16/10: seg, qua e sex da 2ª semana entram; a 3ª semana não existe
      await createWeekly(user, multi(activity.id, { validUntil: '2026-10-16' }));

      expect(await datesOver(user, MON, 4)).toEqual([
        '2026-10-05',
        '2026-10-07',
        '2026-10-09',
        '2026-10-12',
        '2026-10-14',
        '2026-10-16',
      ]);
      expect(
        (await blocksOf(user)).every((b) => b.validUntil?.toISOString().startsWith('2026-10-16')),
      ).toBe(true);
    });

    it('o fim no meio da semana corta só os dias que vêm depois dele', async () => {
      const { user, activity } = await setup();
      await createWeekly(user, multi(activity.id, { validUntil: '2026-10-14' }));

      expect(await datesOver(user, MON, 3)).toEqual([
        '2026-10-05',
        '2026-10-07',
        '2026-10-09',
        '2026-10-12',
        '2026-10-14', // quarta é o último dia; a sexta 16/10 já não existe
      ]);
    });

    it('começando no meio da semana, cada dia só aparece a partir da sua primeira ocorrência', async () => {
      const { user, activity } = await setup();
      await createWeekly(user, multi(activity.id, { validFrom: WED }));

      expect((await week(user, MON)).map((o) => o.date).sort()).toEqual([
        '2026-10-07',
        '2026-10-09',
      ]);
      expect((await week(user, '2026-10-12')).map((o) => o.date).sort()).toEqual([
        '2026-10-12',
        '2026-10-14',
        '2026-10-16',
      ]);
    });

    it('"por N semanas": cada dia marcado ocorre exatamente N vezes, mesmo começando no meio da semana', async () => {
      const { user, activity } = await setup();
      await createWeekly(
        user,
        multi(activity.id, { validFrom: WED, validUntil: validUntilForWeeks(WED, 2) }),
      );

      expect(validUntilForWeeks(WED, 2)).toBe('2026-10-20');
      const dates = await datesOver(user, MON, 5);
      expect(dates).toEqual([
        '2026-10-07',
        '2026-10-09',
        '2026-10-12',
        '2026-10-14',
        '2026-10-16',
        '2026-10-19',
      ]);
      const perWeekday = new Map<number, number>();
      for (const block of await blocksOf(user)) {
        const count = dates.filter(
          (date) => new Date(`${date}T00:00:00Z`).getUTCDay() === block.weekday! % 7,
        ).length;
        perWeekday.set(block.weekday!, count);
      }
      expect([...perWeekday.values()]).toEqual([2, 2, 2]);
    });

    it('aceita um único dia e os sete dias', async () => {
      const { user, activity } = await setup();
      const one = await createWeekly(user, multi(activity.id, { weekdays: [4] }));
      expect(one.status).toBe(201);
      expect(one.body).toHaveLength(1);

      const all = await createWeekly(user, multi(activity.id, { weekdays: [1, 2, 3, 4, 5, 6, 7] }));
      expect(all.status).toBe(201);
      expect(all.body.map((block: { weekday: number }) => block.weekday)).toEqual([
        1, 2, 3, 4, 5, 6, 7,
      ]);
      expect(await week(user, MON)).toHaveLength(8);
    });

    it('rejeita payload inválido com 400 e não grava nada', async () => {
      const { user, activity } = await setup();
      const invalid: [string, object][] = [
        ['sem dias', multi(activity.id, { weekdays: [] })],
        ['dias repetidos', multi(activity.id, { weekdays: [1, 1] })],
        ['dia 8', multi(activity.id, { weekdays: [1, 8] })],
        ['dia 0', multi(activity.id, { weekdays: [0] })],
        ['dia quebrado', multi(activity.id, { weekdays: [1.5] })],
        ['dias em texto', multi(activity.id, { weekdays: '135' })],
        ['mais de 7 dias', multi(activity.id, { weekdays: [1, 2, 3, 4, 5, 6, 7, 1] })],
        ['atravessa a meia-noite', multi(activity.id, { startTime: '23:30', durationMin: 60 })],
        ['duração fora do passo', multi(activity.id, { durationMin: 17 })],
        ['horário inválido', multi(activity.id, { startTime: '25:00' })],
        ['início impossível', multi(activity.id, { validFrom: '2026-02-30' })],
        ['fim impossível', multi(activity.id, { validUntil: '2026-02-30' })],
        ['fim antes do início', multi(activity.id, { validUntil: '2026-10-04' })],
        [
          'fim antes da 1ª ocorrência de um dos dias',
          multi(activity.id, { validUntil: '2026-10-07' }),
        ],
        ['weekday no singular', multi(activity.id, { weekday: 3 })],
        ['recurrence', multi(activity.id, { recurrence: 'weekly' })],
        ['userId no corpo', multi(activity.id, { userId: 'outro' })],
        ['meta que não é UUID', multi(activity.id, { goalId: 'x' })],
        ['sem atividade', { weekdays: [1], startTime: '09:00', durationMin: 60, validFrom: MON }],
        ['sem corpo', {}],
      ];
      for (const [label, body] of invalid) {
        const res = await createWeekly(user, body);
        expect([label, res.status]).toEqual([label, 400]);
      }
      expect(await blocksOf(user)).toHaveLength(0);
    });

    it('a mensagem de fim impossível diz o motivo', async () => {
      const { user, activity } = await setup();
      const res = await createWeekly(user, multi(activity.id, { validUntil: '2026-10-07' }));
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain(
        'O período termina antes da primeira ocorrência de algum dia marcado',
      );
    });

    describe('isolamento e regras da atividade', () => {
      it('atividade de outra pessoa responde 404, igual a uma inexistente, e nada é criado (RS06)', async () => {
        const a = await setup();
        const b = await registerUser(app);

        const foreign = await createWeekly(b, multi(a.activity.id));
        const missing = await createWeekly(b, multi('0192f1a0-7b3c-7000-8000-000000000999'));

        expect(foreign.status).toBe(404);
        expect(missing.status).toBe(404);
        expect(foreign.body).toEqual(missing.body);
        expect(await prisma.block.count({ where: { activityId: a.activity.id } })).toBe(0);
        expect(await blocksOf(b)).toHaveLength(0);
      });

      it('os blocos criados são só da pessoa que pediu', async () => {
        const a = await setup();
        const b = await registerUser(app);
        await createWeekly(a.user, multi(a.activity.id));

        expect(await week(b, MON)).toHaveLength(0);
        expect(await week(a.user, MON)).toHaveLength(3);
      });

      it('atividade ou área arquivada responde 409 e nada é criado', async () => {
        const { user, activity } = await setup();
        await send('post', user, `/api/activities/${activity.id}/archive`);
        expect((await createWeekly(user, multi(activity.id))).status).toBe(409);
        await send('post', user, `/api/activities/${activity.id}/unarchive`);

        await send('post', user, `/api/areas/${activity.areaId}/archive`);
        expect((await createWeekly(user, multi(activity.id))).status).toBe(409);
        expect(await blocksOf(user)).toHaveLength(0);
      });
    });

    describe('meta (RF19)', () => {
      const newGoal = async (user: TestUser, body: object = {}) =>
        (await send('post', user, '/api/goals', { title: 'Meta', ...body })).body.id as string;

      it('todos os blocos criados ficam ligados à meta', async () => {
        const { user, activity } = await setup();
        const goalId = await newGoal(user);

        const res = await createWeekly(user, multi(activity.id, { goalId }));

        expect(res.status).toBe(201);
        expect(res.body.map((block: { goalId: string }) => block.goalId)).toEqual([
          goalId,
          goalId,
          goalId,
        ]);
        expect((await blocksOf(user)).every((block) => block.goalId === goalId)).toBe(true);
      });

      it('meta de outra pessoa responde 404 e nenhum bloco nasce', async () => {
        const a = await setup();
        const b = await setup();
        const goalId = await newGoal(a.user);

        const res = await createWeekly(b.user, multi(b.activity.id, { goalId }));

        expect(res.status).toBe(404);
        expect(await blocksOf(b.user)).toHaveLength(0);
      });

      it('meta concluída não aceita blocos novos (409) e nenhum bloco nasce', async () => {
        const { user, activity } = await setup();
        const goalId = await newGoal(user);
        await send('put', user, `/api/goals/${goalId}/status`, { status: 'completed' });

        const res = await createWeekly(user, multi(activity.id, { goalId }));

        expect(res.status).toBe(409);
        expect(await blocksOf(user)).toHaveLength(0);
      });

      it('excluir a meta em paralelo nunca dá erro 500 nem deixa bloco apontando para o vazio', async () => {
        const { user, activity } = await setup();
        for (let round = 0; round < 6; round += 1) {
          const goalId = await newGoal(user);
          const [created, removed] = await Promise.all([
            createWeekly(user, multi(activity.id, { goalId })),
            send('delete', user, `/api/goals/${goalId}`),
          ]);
          expect([201, 404]).toContain(created.status);
          expect(removed.status).toBeLessThan(500);
        }
        const dangling = await prisma.block.count({
          where: { userId: user.userId, goalId: { not: null }, goal: null },
        });
        expect(dangling).toBe(0);
      });
    });

    it('é tudo ou nada: se um dos blocos falha, nenhum é criado', async () => {
      const { user, activity } = await setup();
      const original = prisma.$transaction.bind(prisma) as (
        fn: (tx: unknown) => Promise<unknown>,
        options?: unknown,
      ) => Promise<unknown>;
      let created = 0;
      const spy = vi.spyOn(prisma, '$transaction').mockImplementation(((
        fn: (tx: unknown) => Promise<unknown>,
        options?: unknown,
      ) =>
        original(async (tx) => {
          const wrapped = new Proxy(tx as object, {
            get(target, prop) {
              const value = Reflect.get(target, prop) as unknown;
              if (prop !== 'block') {
                return typeof value === 'function' ? value.bind(target) : value;
              }
              return new Proxy(value as object, {
                get(block, method) {
                  const member = Reflect.get(block, method) as unknown;
                  if (method !== 'create') {
                    return typeof member === 'function' ? member.bind(block) : member;
                  }
                  return (...args: unknown[]) => {
                    created += 1;
                    // o segundo bloco falha depois de o primeiro já ter sido gravado
                    if (created === 2) throw new Error('falha simulada no segundo bloco');
                    return (member as (...a: unknown[]) => unknown).apply(block, args);
                  };
                },
              });
            },
          });
          return fn(wrapped);
        }, options)) as unknown as typeof prisma.$transaction);
      try {
        const res = await createWeekly(user, multi(activity.id));
        expect(res.status).toBe(500);
        expect(created).toBe(2);
      } finally {
        spy.mockRestore();
      }
      expect(await blocksOf(user)).toHaveLength(0);
      expect(await week(user, MON)).toHaveLength(0);
    });

    it('depois de criados, cada dia é um bloco independente', async () => {
      const { user, activity } = await setup();
      const res = await createWeekly(user, multi(activity.id));
      const [monday, wednesday, friday] = res.body as { id: string }[];

      // pular só a quarta: segunda e sexta continuam
      expect(
        (
          await send('put', user, `/api/blocks/${wednesday!.id}/exceptions/${WED}`, {
            type: 'skip',
          })
        ).status,
      ).toBe(200);
      // encerrar só a série da sexta a partir da semana seguinte
      expect((await send('delete', user, `/api/blocks/${friday!.id}?from=2026-10-12`)).status).toBe(
        204,
      );

      const first = await week(user, MON);
      expect(
        first
          .filter((o) => !o.skipped)
          .map((o) => o.date)
          .sort(),
      ).toEqual(['2026-10-05', '2026-10-09']);
      expect(first.find((o) => o.blockId === wednesday!.id)?.skipped).toBe(true);
      const second = await week(user, '2026-10-12');
      expect(second.map((o) => [o.blockId, o.date]).sort()).toEqual(
        [
          [monday!.id, '2026-10-12'],
          [wednesday!.id, '2026-10-14'],
        ].sort(),
      );
    });
  });

  describe('POST /blocks: bloco semanal com fim', () => {
    it('grava o fim, a série termina nele e a resposta traz validUntil', async () => {
      const { user, activity } = await setup();

      const res = await send(
        'post',
        user,
        '/api/blocks',
        single(activity.id, { validUntil: '2026-10-21' }),
      );

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ weekday: 3, validFrom: WED, validUntil: '2026-10-21' });
      expect(await datesOver(user, MON, 4)).toEqual(['2026-10-07', '2026-10-14', '2026-10-21']);
    });

    it('sem o campo, continua sem fim (contrato anterior)', async () => {
      const { user, activity } = await setup();
      const res = await send('post', user, '/api/blocks', single(activity.id));
      expect(res.status).toBe(201);
      expect(res.body.validUntil).toBeNull();
    });

    it('rejeita fim antes do início ou da primeira ocorrência (400), e fim em bloco avulso', async () => {
      const { user, activity } = await setup();
      const bodies: [string, object][] = [
        ['fim antes do início', single(activity.id, { validUntil: '2026-10-06' })],
        [
          'fim antes da 1ª ocorrência',
          single(activity.id, { validFrom: MON, validUntil: '2026-10-06' }),
        ],
        ['fim impossível', single(activity.id, { validUntil: '2026-13-01' })],
        [
          'avulso com fim',
          {
            recurrence: 'once',
            activityId: activity.id,
            date: WED,
            startTime: '09:00',
            durationMin: 60,
            validUntil: '2026-10-21',
          },
        ],
      ];
      for (const [label, body] of bodies) {
        const res = await send('post', user, '/api/blocks', body);
        expect([label, res.status]).toEqual([label, 400]);
      }
      expect(await blocksOf(user)).toHaveLength(0);
    });

    it('editar "esta e as próximas" numa série com fim mantém o fim', async () => {
      const { user, activity } = await setup();
      const created = await send(
        'post',
        user,
        '/api/blocks',
        single(activity.id, { validUntil: '2026-10-28' }),
      );

      const edited = await send('patch', user, `/api/blocks/${created.body.id}`, {
        from: '2026-10-14',
        startTime: '10:00',
      });

      expect(edited.status).toBe(200);
      expect(edited.body).toMatchObject({ validFrom: '2026-10-14', validUntil: '2026-10-28' });
      expect(await datesOver(user, MON, 5)).toEqual([
        '2026-10-07',
        '2026-10-14',
        '2026-10-21',
        '2026-10-28',
      ]);
    });
  });
});
