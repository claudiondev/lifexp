import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  BLOCK_NOTE_MAX,
  blockSchema,
  todayResponseSchema,
  weekResponseSchema,
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

// Quarta 2026-10-07, 12:00 em São Paulo (UTC-3).
const NOON = '2026-10-07T15:00:00.000Z';
const WEEK = '2026-10-05';
const NEXT_WEEK = '2026-10-12';

describe('Anotação do bloco (e2e)', () => {
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

  const setup = async () => {
    const user = await registerUser(app);
    const [activity] = await listActivities(app, user);
    return { user, activity: activity! };
  };
  const send = (method: 'post' | 'patch' | 'get', user: TestUser, path: string, body?: object) => {
    const req = request(server())[method](path).set(bearer(user));
    return body ? req.send(body) : req;
  };
  const weekly = (activityId: string, overrides: object = {}) => ({
    recurrence: 'weekly',
    activityId,
    weekday: 3,
    startTime: '09:00',
    durationMin: 60,
    validFrom: '2026-09-02',
    ...overrides,
  });
  const weekOf = async (user: TestUser, weekStart: string) => {
    const res = await send('get', user, `/api/blocks/week?weekStart=${weekStart}`);
    expect(res.status).toBe(200);
    return weekResponseSchema.parse(res.body).occurrences;
  };

  describe('criação', () => {
    it('bloco semanal guarda a anotação e a devolve', async () => {
      const { user, activity } = await setup();

      const res = await send(
        'post',
        user,
        '/api/blocks',
        weekly(activity.id, { note: 'Aula de inglês' }),
      );

      expect(res.status).toBe(201);
      expect(blockSchema.safeParse(res.body).success).toBe(true);
      expect(res.body.note).toBe('Aula de inglês');
      const stored = await prisma.block.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(stored.note).toBe('Aula de inglês');
    });

    it('bloco avulso também aceita anotação', async () => {
      const { user, activity } = await setup();

      const res = await send('post', user, '/api/blocks', {
        recurrence: 'once',
        activityId: activity.id,
        date: WEEK,
        startTime: '10:00',
        durationMin: 30,
        note: 'Levar o documento',
      });

      expect(res.status).toBe(201);
      expect(res.body.note).toBe('Levar o documento');
    });

    it('vários dias de uma vez: cada dia recebe a mesma anotação', async () => {
      const { user, activity } = await setup();

      const res = await send('post', user, '/api/blocks/weekly', {
        activityId: activity.id,
        weekdays: [1, 3],
        startTime: '09:00',
        durationMin: 60,
        validFrom: WEEK,
        note: 'Treino de pernas',
      });

      expect(res.status).toBe(201);
      expect(res.body.map((block: { note: string }) => block.note)).toEqual([
        'Treino de pernas',
        'Treino de pernas',
      ]);
    });

    it('sem anotação, texto vazio ou só espaços viram nulo', async () => {
      const { user, activity } = await setup();

      for (const note of [undefined, null, '', '   \n\t ']) {
        const res = await send('post', user, '/api/blocks', weekly(activity.id, { note }));
        expect(res.status).toBe(201);
        expect(res.body.note).toBeNull();
      }
    });

    it('apara os espaços das pontas e mantém os do meio e as quebras de linha', async () => {
      const { user, activity } = await setup();

      const res = await send(
        'post',
        user,
        '/api/blocks',
        weekly(activity.id, { note: '  lição 5\ntrazer o caderno  ' }),
      );

      expect(res.body.note).toBe('lição 5\ntrazer o caderno');
    });

    it(`aceita ${BLOCK_NOTE_MAX} caracteres e recusa ${BLOCK_NOTE_MAX + 1}`, async () => {
      const { user, activity } = await setup();

      const ok = await send(
        'post',
        user,
        '/api/blocks',
        weekly(activity.id, { note: 'a'.repeat(BLOCK_NOTE_MAX) }),
      );
      const tooLong = await send(
        'post',
        user,
        '/api/blocks',
        weekly(activity.id, { note: 'a'.repeat(BLOCK_NOTE_MAX + 1) }),
      );

      expect(ok.status).toBe(201);
      expect(tooLong.status).toBe(400);
    });

    it('o limite vale depois do trim (espaços nas pontas não contam)', async () => {
      const { user, activity } = await setup();

      const res = await send(
        'post',
        user,
        '/api/blocks',
        weekly(activity.id, { note: ` ${'a'.repeat(BLOCK_NOTE_MAX)} ` }),
      );

      expect(res.status).toBe(201);
    });

    it('anotação que não é texto vira 400', async () => {
      const { user, activity } = await setup();

      for (const note of [123, { a: 1 }, ['x'], true]) {
        const res = await send('post', user, '/api/blocks', weekly(activity.id, { note }));
        expect(res.status).toBe(400);
      }
    });

    it('guarda como texto puro: marcação não é interpretada nem alterada', async () => {
      const { user, activity } = await setup();
      const note = '<b>oi</b> **negrito** [link](javascript:alert(1))';

      const res = await send('post', user, '/api/blocks', weekly(activity.id, { note }));

      expect(res.body.note).toBe(note);
    });
  });

  describe('leitura', () => {
    it('a semana traz a anotação em TODAS as ocorrências da série', async () => {
      const { user, activity } = await setup();
      const created = await send(
        'post',
        user,
        '/api/blocks',
        weekly(activity.id, { note: 'Aula de inglês' }),
      );

      const first = await weekOf(user, WEEK);
      const second = await weekOf(user, NEXT_WEEK);

      expect(first.map((o) => [o.blockId, o.note])).toEqual([[created.body.id, 'Aula de inglês']]);
      expect(second.map((o) => o.note)).toEqual(['Aula de inglês']);
    });

    it('bloco sem anotação traz note nulo', async () => {
      const { user, activity } = await setup();
      await send('post', user, '/api/blocks', weekly(activity.id));

      expect((await weekOf(user, WEEK)).map((o) => o.note)).toEqual([null]);
    });

    it('a tela Hoje mostra a anotação', async () => {
      const { user, activity } = await setup();
      await send('post', user, '/api/blocks', weekly(activity.id, { note: 'Lição 5' }));

      const res = await send('get', user, '/api/today');

      expect(res.status).toBe(200);
      const today = todayResponseSchema.parse(res.body);
      expect(today.items.map((item) => item.note)).toEqual(['Lição 5']);
    });

    it('a anotação não vaza para o bloco de outra pessoa', async () => {
      const mine = await setup();
      const other = await setup();
      await send('post', mine.user, '/api/blocks', weekly(mine.activity.id, { note: 'segredo' }));
      await send('post', other.user, '/api/blocks', weekly(other.activity.id));

      expect((await weekOf(other.user, WEEK)).map((o) => o.note)).toEqual([null]);
    });
  });

  describe('edição ("esta e as próximas")', () => {
    it('mudar só a anotação com passado divide a série: o passado mantém a antiga', async () => {
      const { user, activity } = await setup();
      const created = await send(
        'post',
        user,
        '/api/blocks',
        weekly(activity.id, { note: 'antiga' }),
      );

      const res = await send('patch', user, `/api/blocks/${created.body.id}`, {
        from: NEXT_WEEK.replace('12', '14'),
        note: 'nova',
      });

      expect(res.status).toBe(200);
      expect(res.body.note).toBe('nova');
      expect(res.body.id).not.toBe(created.body.id);
      const old = await prisma.block.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(old.note).toBe('antiga');
      // Semana de 05/10 (antes do corte, 2026-10-14) segue com a anotação antiga; a de 12/10 já vale a nova.
      expect((await weekOf(user, WEEK)).map((o) => o.note)).toEqual(['antiga']);
      expect((await weekOf(user, NEXT_WEEK)).map((o) => o.note)).toEqual(['nova']);
    });

    it('sem passado, edita no lugar', async () => {
      const { user, activity } = await setup();
      const created = await send(
        'post',
        user,
        '/api/blocks',
        weekly(activity.id, { note: 'antiga', validFrom: '2026-10-14' }),
      );

      const res = await send('patch', user, `/api/blocks/${created.body.id}`, {
        from: '2026-10-14',
        note: 'nova',
      });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(created.body.id);
      expect(res.body.note).toBe('nova');
    });

    it('note nulo ou vazio apaga a anotação; ausente mantém', async () => {
      const { user, activity } = await setup();
      const created = await send(
        'post',
        user,
        '/api/blocks',
        weekly(activity.id, { note: 'fica', validFrom: '2026-10-14' }),
      );
      const id = created.body.id;

      const kept = await send('patch', user, `/api/blocks/${id}`, {
        from: '2026-10-14',
        durationMin: 90,
      });
      expect(kept.body.note).toBe('fica');

      const cleared = await send('patch', user, `/api/blocks/${id}`, {
        from: '2026-10-14',
        note: null,
      });
      expect(cleared.body.note).toBeNull();

      await send('patch', user, `/api/blocks/${id}`, { from: '2026-10-14', note: 'de novo' });
      const blank = await send('patch', user, `/api/blocks/${id}`, {
        from: '2026-10-14',
        note: '   ',
      });
      expect(blank.body.note).toBeNull();
    });

    it('mudar outro campo com passado leva a anotação para a série nova', async () => {
      const { user, activity } = await setup();
      const created = await send(
        'post',
        user,
        '/api/blocks',
        weekly(activity.id, { note: 'Aula de inglês' }),
      );

      const res = await send('patch', user, `/api/blocks/${created.body.id}`, {
        from: '2026-10-14',
        startTime: '18:00',
      });

      expect(res.status).toBe(200);
      expect(res.body.note).toBe('Aula de inglês');
    });

    it('recusa anotação acima do limite na edição', async () => {
      const { user, activity } = await setup();
      const created = await send('post', user, '/api/blocks', weekly(activity.id));

      const res = await send('patch', user, `/api/blocks/${created.body.id}`, {
        from: '2026-10-14',
        note: 'a'.repeat(BLOCK_NOTE_MAX + 1),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('restrições do banco (defesa em profundidade)', () => {
    const insertWithNote = async (note: string | null) => {
      const { user, activity } = await setup();
      return prisma.$executeRaw`
        INSERT INTO "Block" ("id", "userId", "activityId", "recurrence", "weekday", "startTime", "durationMin", "validFrom", "note", "updatedAt")
        VALUES (gen_random_uuid(), ${user.userId}, ${activity.id}, 'WEEKLY', 3, '09:00', 60, '2026-10-07', ${note}, now())`;
    };

    it('aceita nulo, 1 e 500 caracteres', async () => {
      await expect(insertWithNote(null)).resolves.toBe(1);
      await expect(insertWithNote('a')).resolves.toBe(1);
      await expect(insertWithNote('a'.repeat(500))).resolves.toBe(1);
    });

    it('recusa texto vazio e acima de 500 caracteres', async () => {
      await expect(insertWithNote('')).rejects.toThrow(/Block_note_length_check/);
      await expect(insertWithNote('a'.repeat(501))).rejects.toThrow(/Block_note_length_check/);
    });
  });
});
