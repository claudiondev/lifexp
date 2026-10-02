import { Logger, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { MAX_PINNED_NOTES, noteSchema, notePageSchema, tagListSchema } from '@lifexp/shared';
import { NotesService } from '../src/notes/notes.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  FakeClock,
  bearer,
  createTestApp,
  listActivities,
  registerUser,
  type TestUser,
} from './helpers.js';

const T0 = '2026-10-07T15:00:00.000Z';

describe('Notas (e2e, RF42 a RF45)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const clock = new FakeClock(T0);
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp({ clock });
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => clock.set(T0));

  const send = (
    method: 'get' | 'post' | 'patch' | 'delete' | 'put',
    user: TestUser,
    path: string,
    body?: object,
  ) => {
    const req = request(server())[method](path).set(bearer(user));
    return body ? req.send(body) : req;
  };
  const create = (user: TestUser, body: object) => send('post', user, '/api/notes', body);
  const make = async (user: TestUser, body: object) => {
    const res = await create(user, body);
    expect(res.status).toBe(201);
    return noteSchema.parse(res.body);
  };
  const page = async (user: TestUser, query = '') => {
    const res = await send('get', user, `/api/notes${query}`);
    expect(res.status).toBe(200);
    return notePageSchema.parse(res.body);
  };
  const advance = (seconds: number) =>
    clock.set(new Date(clock.now().getTime() + seconds * 1000).toISOString());

  /** Pessoa com um alvo de cada tipo de vínculo. */
  const withTargets = async () => {
    const user = await registerUser(app);
    const [activity] = await listActivities(app, user);
    const goal = (await send('post', user, '/api/goals', { title: 'Escrever o livro' })).body;
    const event = (
      await send('post', user, '/api/events', {
        title: 'Consulta',
        date: '2026-10-20',
        category: 'medical',
      })
    ).body;
    const block = (
      await send('post', user, '/api/blocks', {
        recurrence: 'once',
        activityId: activity!.id,
        date: '2026-10-07',
        startTime: '09:00',
        durationMin: 60,
      })
    ).body;
    const area = (await send('get', user, '/api/areas')).body.find(
      (a: { id: string }) => a.id === activity!.areaId,
    );
    return { user, activity: activity!, goal, event, block, area };
  };

  it('exige autenticação em todas as rotas', async () => {
    const id = randomUUID();
    for (const [method, path] of [
      ['get', '/api/notes'],
      ['get', '/api/notes/tags'],
      ['post', '/api/notes'],
      ['get', `/api/notes/${id}`],
      ['patch', `/api/notes/${id}`],
      ['delete', `/api/notes/${id}`],
    ] as const) {
      expect([path, (await request(server())[method](path)).status]).toEqual([path, 401]);
    }
  });

  describe('criar', () => {
    it('só o título é obrigatório: o resto começa vazio', async () => {
      const user = await registerUser(app);
      const note = await make(user, { title: 'Ideias' });
      expect(note).toMatchObject({
        title: 'Ideias',
        content: '',
        tags: [],
        pinned: false,
        link: null,
        createdAt: T0,
        updatedAt: T0,
      });
    });

    it('grava tudo, normaliza as tags e guarda o markdown exatamente como veio', async () => {
      const user = await registerUser(app);
      const content = '# Pauta\n\n- item **forte**\n\n```js\nconst x = 1;\n```\n';
      const note = await make(user, {
        title: '  Reunião  ',
        content,
        tags: ['Trabalho', '#trabalho', 'Saúde Mental'],
        pinned: true,
      });
      expect(note).toMatchObject({
        title: 'Reunião',
        content,
        tags: ['trabalho', 'saúde-mental'],
        pinned: true,
      });
      expect((await send('get', user, `/api/notes/${note.id}`)).body).toEqual(note);
    });

    it('não altera nem "limpa" o texto: HTML e scripts ficam como o usuário escreveu (a sanitização é na renderização, RS10)', async () => {
      const user = await registerUser(app);
      const content =
        '<script>alert(1)</script> <img src=x onerror=alert(2)> [x](javascript:alert(3))';
      const note = await make(user, { title: 't', content });
      expect(note.content).toBe(content);
      expect((await send('get', user, `/api/notes/${note.id}`)).body.content).toBe(content);
    });

    it('o dono vem do token, nunca do corpo (RN39)', async () => {
      const [a, b] = [await registerUser(app), await registerUser(app)];
      expect((await create(a, { title: 'x', userId: b.userId })).status).toBe(400);
      const note = await make(a, { title: 'da Ana' });
      expect((await prisma.note.findUniqueOrThrow({ where: { id: note.id } })).userId).toBe(
        a.userId,
      );
    });

    it('rejeita corpo inválido (400) e não grava nada', async () => {
      const user = await registerUser(app);
      const tooMany = Array.from({ length: 11 }, (_, i) => `t${i}`);
      const bodies: [string, object][] = [
        ['sem título', {}],
        ['título vazio', { title: '' }],
        ['título só espaços', { title: '   ' }],
        ['título longo', { title: 'x'.repeat(201) }],
        ['conteúdo longo', { title: 'x', content: 'a'.repeat(20_001) }],
        ['11 tags', { title: 'x', tags: tooMany }],
        ['tag inválida', { title: 'x', tags: ['a b!'] }],
        ['tag longa', { title: 'x', tags: ['x'.repeat(31)] }],
        ['tags não é lista', { title: 'x', tags: 'a' }],
        ['campo extra', { title: 'x', extra: 1 }],
        ['id no corpo', { title: 'x', id: randomUUID() }],
        ['data de criação no corpo', { title: 'x', createdAt: T0 }],
        ['vínculo de tipo errado', { title: 'x', link: { type: 'note', id: randomUUID() } }],
        ['vínculo sem id', { title: 'x', link: { type: 'goal' } }],
        ['fixada não booleano', { title: 'x', pinned: 'sim' }],
      ];
      for (const [label, body] of bodies) {
        expect([label, (await create(user, body)).status]).toEqual([label, 400]);
      }
      expect(await prisma.note.count({ where: { userId: user.userId } })).toBe(0);
    });

    it('aceita os limites exatos: título de 200, texto de 20 mil, 10 tags de 30 caracteres', async () => {
      const user = await registerUser(app);
      const tags = Array.from({ length: 10 }, (_, i) => `${i}`.padEnd(30, 'x'));
      const note = await make(user, {
        title: 'x'.repeat(200),
        content: 'a'.repeat(20_000),
        tags,
      });
      expect(note.tags).toHaveLength(10);
    });

    it('acentos, emoji e quebras de linha passam intactos', async () => {
      const user = await registerUser(app);
      const content = 'Ação 🚀\nSegunda linha — “aspas”';
      expect((await make(user, { title: 'Ñandú 😀', content })).content).toBe(content);
    });
  });

  describe('vínculo (RF44)', () => {
    it('vincula a área, meta, evento ou bloco e devolve o nome do alvo', async () => {
      const t = await withTargets();
      const cases: [string, string, string][] = [
        ['area', t.area.id, t.area.name],
        ['goal', t.goal.id, 'Escrever o livro'],
        ['event', t.event.id, 'Consulta'],
        ['block', t.block.id, t.activity.name],
      ];
      for (const [type, id, label] of cases) {
        const note = await make(t.user, { title: type, link: { type, id } });
        expect([type, note.link]).toEqual([type, { type, id, label }]);
      }
    });

    it('alvo de outra pessoa responde 404, igual a um que não existe, e nenhuma nota é criada (RS06)', async () => {
      const [a, b] = [await withTargets(), await withTargets()];
      const targets: [string, string, string][] = [
        ['area', b.area.id, 'Área não encontrada'],
        ['goal', b.goal.id, 'Meta não encontrada'],
        ['event', b.event.id, 'Evento não encontrado'],
        ['block', b.block.id, 'Bloco não encontrado'],
      ];
      for (const [type, id, message] of targets) {
        const foreign = await create(a.user, { title: 'x', link: { type, id } });
        const missing = await create(a.user, { title: 'x', link: { type, id: randomUUID() } });
        expect([type, foreign.status]).toEqual([type, 404]);
        expect(missing.status).toBe(404);
        expect(foreign.body.message).toBe(message);
        expect(foreign.body).toEqual(missing.body);
      }
      expect(await prisma.note.count({ where: { userId: a.user.userId } })).toBe(0);
    });

    it('excluir o alvo solta o vínculo e a nota continua (a meta, o evento e o bloco)', async () => {
      const t = await withTargets();
      const goalNote = await make(t.user, { title: 'g', link: { type: 'goal', id: t.goal.id } });
      const eventNote = await make(t.user, { title: 'e', link: { type: 'event', id: t.event.id } });
      const blockNote = await make(t.user, { title: 'b', link: { type: 'block', id: t.block.id } });

      await send('delete', t.user, `/api/goals/${t.goal.id}`);
      await send('delete', t.user, `/api/events/${t.event.id}`);
      await send('delete', t.user, `/api/blocks/${t.block.id}?from=2026-10-07`);

      for (const note of [goalNote, eventNote]) {
        const res = await send('get', t.user, `/api/notes/${note.id}`);
        expect(res.status).toBe(200);
        expect(res.body.link).toBeNull();
        expect(res.body.title).toBe(note.title);
      }
      // um bloco avulso só some de verdade se não tiver conclusão; aqui some, e a nota fica solta
      expect((await send('get', t.user, `/api/notes/${blockNote.id}`)).status).toBe(200);
    });
  });

  describe('ler, editar e excluir', () => {
    it('só o dono lê; nota alheia responde 404, igual a uma inexistente (RS06)', async () => {
      const [a, b] = [await registerUser(app), await registerUser(app)];
      const note = await make(a, { title: 'segredo', content: 'conteúdo da Ana' });

      const foreign = await send('get', b, `/api/notes/${note.id}`);
      const missing = await send('get', b, `/api/notes/${randomUUID()}`);

      expect(foreign.status).toBe(404);
      expect(foreign.body).toEqual(missing.body);
      expect(JSON.stringify(foreign.body)).not.toContain('segredo');
      expect((await send('get', a, `/api/notes/${note.id}`)).status).toBe(200);
    });

    it('id que não é UUID responde 400', async () => {
      const user = await registerUser(app);
      expect((await send('get', user, '/api/notes/abc')).status).toBe(400);
      expect((await send('patch', user, '/api/notes/abc', { title: 'x' })).status).toBe(400);
      expect((await send('delete', user, '/api/notes/abc')).status).toBe(400);
    });

    it('edita só o que veio: o resto fica como estava', async () => {
      const user = await registerUser(app);
      const note = await make(user, {
        title: 'Velho',
        content: 'texto',
        tags: ['a'],
        pinned: true,
      });
      advance(60);

      const res = await send('patch', user, `/api/notes/${note.id}`, { title: 'Novo' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        title: 'Novo',
        content: 'texto',
        tags: ['a'],
        pinned: true,
      });
    });

    it('substitui as tags (normalizadas) e pode esvaziar texto e tags', async () => {
      const user = await registerUser(app);
      const note = await make(user, { title: 'x', content: 'texto', tags: ['a', 'b'] });
      const res = await send('patch', user, `/api/notes/${note.id}`, { tags: ['C', '#c', 'D'] });
      expect(res.body.tags).toEqual(['c', 'd']);
      const cleared = await send('patch', user, `/api/notes/${note.id}`, { content: '', tags: [] });
      expect(cleared.body).toMatchObject({ content: '', tags: [] });
    });

    it('a data de atualização anda ao editar o conteúdo, mas NÃO ao fixar ou desafixar', async () => {
      const user = await registerUser(app);
      const note = await make(user, { title: 'x' });
      advance(3600);
      const pinned = await send('patch', user, `/api/notes/${note.id}`, { pinned: true });
      expect(pinned.body.updatedAt).toBe(T0);
      const unpinned = await send('patch', user, `/api/notes/${note.id}`, { pinned: false });
      expect(unpinned.body.updatedAt).toBe(T0);

      const edited = await send('patch', user, `/api/notes/${note.id}`, { content: 'agora sim' });
      expect(edited.body.updatedAt).toBe('2026-10-07T16:00:00.000Z');
      expect(edited.body.createdAt).toBe(T0);
    });

    it('vincula, troca e desvincula (link nulo)', async () => {
      const t = await withTargets();
      const note = await make(t.user, { title: 'x' });

      const toGoal = await send('patch', t.user, `/api/notes/${note.id}`, {
        link: { type: 'goal', id: t.goal.id },
      });
      expect(toGoal.body.link).toEqual({ type: 'goal', id: t.goal.id, label: 'Escrever o livro' });
      const toEvent = await send('patch', t.user, `/api/notes/${note.id}`, {
        link: { type: 'event', id: t.event.id },
      });
      expect(toEvent.body.link).toMatchObject({ type: 'event', label: 'Consulta' });
      const cleared = await send('patch', t.user, `/api/notes/${note.id}`, { link: null });
      expect(cleared.body.link).toBeNull();
      const row = await prisma.note.findUniqueOrThrow({ where: { id: note.id } });
      expect([row.areaId, row.goalId, row.eventId, row.blockId]).toEqual([null, null, null, null]);
    });

    it('trocar entre todos os tipos de vínculo deixa sempre um só (área, meta, evento e bloco)', async () => {
      const t = await withTargets();
      const note = await make(t.user, { title: 'x', link: { type: 'area', id: t.area.id } });
      const columns = async () => {
        const row = await prisma.note.findUniqueOrThrow({ where: { id: note.id } });
        return [row.areaId, row.goalId, row.eventId, row.blockId].filter((value) => value !== null);
      };
      const sequence: [string, string][] = [
        ['goal', t.goal.id],
        ['area', t.area.id],
        ['block', t.block.id],
        ['event', t.event.id],
        ['area', t.area.id],
      ];
      for (const [type, id] of sequence) {
        const res = await send('patch', t.user, `/api/notes/${note.id}`, { link: { type, id } });
        expect([type, res.status]).toEqual([type, 200]);
        expect(res.body.link).toMatchObject({ type, id });
        expect(await columns()).toEqual([id]);
      }
    });

    it('vincular a alvo alheio responde 404 e a nota não muda', async () => {
      const [a, b] = [await withTargets(), await withTargets()];
      const note = await make(a.user, { title: 'x', link: { type: 'goal', id: a.goal.id } });
      const res = await send('patch', a.user, `/api/notes/${note.id}`, {
        title: 'mudou',
        link: { type: 'goal', id: b.goal.id },
      });
      expect(res.status).toBe(404);
      const after = (await send('get', a.user, `/api/notes/${note.id}`)).body;
      expect(after.title).toBe('x');
      expect(after.link.id).toBe(a.goal.id);
    });

    it('rejeita corpo vazio, campos extras e valores inválidos (400)', async () => {
      const user = await registerUser(app);
      const note = await make(user, { title: 'x' });
      for (const body of [
        {},
        { userId: randomUUID() },
        { createdAt: T0 },
        { title: '' },
        { title: 'x'.repeat(201) },
        { content: 'a'.repeat(20_001) },
        { tags: ['a b!'] },
        { pinned: 'sim' },
        { link: { type: 'goal' } },
      ]) {
        expect([body, (await send('patch', user, `/api/notes/${note.id}`, body)).status]).toEqual([
          body,
          400,
        ]);
      }
    });

    it('editar nota alheia responde 404 e nada muda (RS06)', async () => {
      const [a, b] = [await registerUser(app), await registerUser(app)];
      const note = await make(a, { title: 'da Ana' });
      const res = await send('patch', b, `/api/notes/${note.id}`, { title: 'invadida' });
      expect(res.status).toBe(404);
      expect((await send('get', a, `/api/notes/${note.id}`)).body.title).toBe('da Ana');
    });

    it('exclui; excluir de novo responde 404; nota alheia não é excluída', async () => {
      const [a, b] = [await registerUser(app), await registerUser(app)];
      const note = await make(a, { title: 'x' });

      expect((await send('delete', b, `/api/notes/${note.id}`)).status).toBe(404);
      expect(await prisma.note.count({ where: { id: note.id } })).toBe(1);

      expect((await send('delete', a, `/api/notes/${note.id}`)).status).toBe(204);
      expect(await prisma.note.count({ where: { id: note.id } })).toBe(0);
      expect((await send('delete', a, `/api/notes/${note.id}`)).status).toBe(404);
    });
  });

  describe('fixar (RF45)', () => {
    it('fixadas aparecem primeiro, mesmo sendo mais antigas', async () => {
      const user = await registerUser(app);
      const old = await make(user, { title: 'antiga fixada', pinned: true });
      advance(60);
      await make(user, { title: 'nova' });
      advance(60);
      await make(user, { title: 'mais nova' });

      expect((await page(user)).items.map((n) => n.title)).toEqual([
        'antiga fixada',
        'mais nova',
        'nova',
      ]);
      expect((await page(user)).items[0]!.id).toBe(old.id);
    });

    it('desafixar devolve a nota ao lugar cronológico (a data de atualização não mudou)', async () => {
      const user = await registerUser(app);
      const old = await make(user, { title: 'antiga', pinned: true });
      advance(60);
      await make(user, { title: 'nova' });
      await send('patch', user, `/api/notes/${old.id}`, { pinned: false });
      expect((await page(user)).items.map((n) => n.title)).toEqual(['nova', 'antiga']);
    });

    it(`no máximo ${MAX_PINNED_NOTES} fixadas: a seguinte responde 409, ao criar ou ao fixar`, async () => {
      const user = await registerUser(app);
      for (let i = 0; i < MAX_PINNED_NOTES; i += 1)
        await make(user, { title: `f${i}`, pinned: true });
      const extra = await make(user, { title: 'extra' });

      const create21 = await create(user, { title: 'f21', pinned: true });
      const pin21 = await send('patch', user, `/api/notes/${extra.id}`, { pinned: true });

      expect(create21.status).toBe(409);
      expect(pin21.status).toBe(409);
      expect(pin21.body.message).toContain('Desafixe uma');
      expect(await prisma.note.count({ where: { userId: user.userId, pinned: true } })).toBe(
        MAX_PINNED_NOTES,
      );
    });

    it('fixar uma que já está fixada não conta de novo (nem dá 409 no limite)', async () => {
      const user = await registerUser(app);
      const first = await make(user, { title: 'f0', pinned: true });
      for (let i = 1; i < MAX_PINNED_NOTES; i += 1)
        await make(user, { title: `f${i}`, pinned: true });
      expect((await send('patch', user, `/api/notes/${first.id}`, { pinned: true })).status).toBe(
        200,
      );
      expect(
        (await send('patch', user, `/api/notes/${first.id}`, { title: 'novo título' })).status,
      ).toBe(200);
    });

    it('desafixar uma libera uma vaga', async () => {
      const user = await registerUser(app);
      const first = await make(user, { title: 'f0', pinned: true });
      for (let i = 1; i < MAX_PINNED_NOTES; i += 1)
        await make(user, { title: `f${i}`, pinned: true });
      expect((await create(user, { title: 'x', pinned: true })).status).toBe(409);
      await send('patch', user, `/api/notes/${first.id}`, { pinned: false });
      expect((await create(user, { title: 'x', pinned: true })).status).toBe(201);
    });

    it('o limite vale por pessoa, e pedidos simultâneos não o ultrapassam', async () => {
      const [a, b] = [await registerUser(app), await registerUser(app)];
      const results = await Promise.all(
        Array.from({ length: MAX_PINNED_NOTES + 6 }, (_, i) =>
          create(a, { title: `p${i}`, pinned: true }),
        ),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(MAX_PINNED_NOTES);
      expect(results.filter((r) => r.status === 409)).toHaveLength(6);
      expect(await prisma.note.count({ where: { userId: a.userId, pinned: true } })).toBe(
        MAX_PINNED_NOTES,
      );
      // a outra pessoa não é afetada
      expect((await create(b, { title: 'minha', pinned: true })).status).toBe(201);
    });
  });

  describe('listar, buscar e filtrar (RF43)', () => {
    it('conta nova: lista vazia, sem próxima página', async () => {
      const user = await registerUser(app);
      expect(await page(user)).toEqual({ items: [], nextCursor: null });
    });

    it('a lista traz um trecho, NUNCA o texto completo, com o vínculo e as tags', async () => {
      const t = await withTargets();
      await make(t.user, {
        title: 'Livro',
        content: '# Capítulo 1\n\n**Cena** inicial no [porto](https://exemplo.com/x)',
        tags: ['livro'],
        link: { type: 'goal', id: t.goal.id },
      });
      const { items } = await page(t.user);
      expect(items[0]).toMatchObject({
        title: 'Livro',
        excerpt: 'Capítulo 1 Cena inicial no porto',
        tags: ['livro'],
        link: { type: 'goal', label: 'Escrever o livro' },
      });
      expect(items[0]).not.toHaveProperty('content');
    });

    it('o serviço também não devolve o texto completo na lista (o filtro da resposta é só a segunda camada)', async () => {
      const user = await registerUser(app);
      await make(user, { title: 'x', content: 'texto completo da nota' });
      const result = await app.get(NotesService).list(user.userId, { limit: 20 });
      expect(Object.keys(result.items[0]!)).not.toContain('content');
    });

    it('o trecho é limitado, mesmo com um texto de 20 mil caracteres', async () => {
      const user = await registerUser(app);
      await make(user, { title: 'longa', content: 'palavra '.repeat(2500) });
      const [item] = (await page(user)).items;
      expect(Array.from(item!.excerpt).length).toBeLessThanOrEqual(161);
      expect(item!.excerpt.endsWith('…')).toBe(true);
    });

    it('pagina por cursor, com fixadas e não fixadas, sem repetir nem pular (RNF08)', async () => {
      const user = await registerUser(app);
      const expected: string[] = [];
      // fixadas (3), depois não fixadas (6) em momentos diferentes
      for (let i = 0; i < 3; i += 1) {
        advance(1);
        expected.push((await make(user, { title: `fixada ${i}`, pinned: true })).id);
      }
      const pinnedIds = expected.splice(0).reverse();
      const rest: string[] = [];
      for (let i = 0; i < 6; i += 1) {
        advance(1);
        rest.push((await make(user, { title: `nota ${i}` })).id);
      }
      const all = [...pinnedIds, ...rest.reverse()];

      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const current = await page(user, `?limit=4${cursor ? `&before=${cursor}` : ''}`);
        seen.push(...current.items.map((n) => n.id));
        cursor = current.nextCursor;
        pages += 1;
      } while (cursor && pages < 10);

      expect(seen).toEqual(all);
      expect(pages).toBe(3);
    });

    it('notas alteradas no mesmo instante têm ordem estável (desempate pelo id) e a paginação não perde nenhuma', async () => {
      const user = await registerUser(app);
      const ids: string[] = [];
      for (let i = 0; i < 7; i += 1) ids.push((await make(user, { title: `n${i}` })).id); // mesmo T0
      const expected = [...ids].sort().reverse();

      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const current = await page(user, `?limit=3${cursor ? `&before=${cursor}` : ''}`);
        seen.push(...current.items.map((n) => n.id));
        cursor = current.nextCursor;
      } while (cursor);

      expect(seen).toEqual(expected);
    });

    it('uma página exatamente cheia no fim não promete outra', async () => {
      const user = await registerUser(app);
      for (let i = 0; i < 3; i += 1) await make(user, { title: `n${i}` });
      const { items, nextCursor } = await page(user, '?limit=3');
      expect(items).toHaveLength(3);
      expect(nextCursor).toBeNull();
    });

    it('limite padrão de 20, máximo de 50; limites e cursor inválidos dão 400', async () => {
      const user = await registerUser(app);
      for (let i = 0; i < 21; i += 1) await make(user, { title: `n${i}` });
      expect((await page(user)).items).toHaveLength(20);
      expect((await send('get', user, '/api/notes?limit=51')).status).toBe(400);
      expect((await send('get', user, '/api/notes?limit=0')).status).toBe(400);
      // cursor com caracteres que não existem num cursor nosso
      expect((await send('get', user, '/api/notes?before=a%20b')).status).toBe(400);
      // cursor bem formado, mas que nós não emitimos: 400, nunca erro 500
      const res = await send('get', user, '/api/notes?before=abcdef');
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Cursor inválido');
    });

    it('busca no título e no texto, sem diferenciar maiúsculas', async () => {
      const user = await registerUser(app);
      await make(user, { title: 'Relatório mensal', content: 'números' });
      await make(user, { title: 'Receitas', content: 'bolo de RELATÓRIO? não, de cenoura' });
      await make(user, { title: 'Outra', content: 'nada a ver' });

      const titles = async (q: string) =>
        (await page(user, `?q=${encodeURIComponent(q)}`)).items.map((n) => n.title).sort();
      expect(await titles('relatório')).toEqual(['Receitas', 'Relatório mensal']);
      expect(await titles('RELATÓRIO')).toEqual(['Receitas', 'Relatório mensal']);
      expect(await titles('cenoura')).toEqual(['Receitas']);
      expect(await titles('inexistente')).toEqual([]);
    });

    it('os coringas do SQL (% e _) são buscados como texto comum', async () => {
      const user = await registerUser(app);
      await make(user, { title: 'desconto', content: 'ganhei 100% de desconto' });
      await make(user, { title: 'nome_arquivo', content: 'x' });
      await make(user, { title: 'abc', content: 'qualquer coisa' });

      const titles = async (q: string) =>
        (await page(user, `?q=${encodeURIComponent(q)}`)).items.map((n) => n.title);
      expect(await titles('%')).toEqual(['desconto']);
      expect(await titles('_')).toEqual(['nome_arquivo']);
      expect(await titles('100%')).toEqual(['desconto']);
    });

    it('busca com aspas, barras e texto de injeção só devolve o que contém aquele texto', async () => {
      const user = await registerUser(app);
      await make(user, { title: "d'Água", content: 'x' });
      const hostile = ['\'; DROP TABLE "Note"; --', '\\', '"', "' OR '1'='1"];
      for (const q of hostile) {
        const res = await send('get', user, `/api/notes?q=${encodeURIComponent(q)}`);
        expect([q, res.status]).toEqual([q, 200]);
        expect(notePageSchema.parse(res.body).items).toEqual([]);
      }
      expect((await page(user, `?q=${encodeURIComponent("d'água")}`)).items).toHaveLength(1);
      expect(await prisma.note.count({ where: { userId: user.userId } })).toBe(1);
    });

    it('busca limitada a 100 caracteres (400 acima disso)', async () => {
      const user = await registerUser(app);
      expect((await send('get', user, `/api/notes?q=${'x'.repeat(100)}`)).status).toBe(200);
      expect((await send('get', user, `/api/notes?q=${'x'.repeat(101)}`)).status).toBe(400);
    });

    it('filtra por tag, aceitando a forma digitada (maiúsculas, "#")', async () => {
      const user = await registerUser(app);
      await make(user, { title: 'a', tags: ['saúde', 'trabalho'] });
      await make(user, { title: 'b', tags: ['trabalho'] });
      await make(user, { title: 'c', tags: ['saúde-mental'] }); // "saúde-mental" não é "saúde"

      const titles = async (tag: string) =>
        (await page(user, `?tag=${encodeURIComponent(tag)}`)).items.map((n) => n.title).sort();
      expect(await titles('trabalho')).toEqual(['a', 'b']);
      expect(await titles('Saúde')).toEqual(['a']);
      expect(await titles('#TRABALHO')).toEqual(['a', 'b']);
      expect(await titles('nenhuma')).toEqual([]);
      expect((await send('get', user, '/api/notes?tag=a%20b!')).status).toBe(400);
    });

    it('combina busca, tag e vínculo (todos precisam valer)', async () => {
      const t = await withTargets();
      await make(t.user, {
        title: 'plano',
        tags: ['livro'],
        link: { type: 'goal', id: t.goal.id },
      });
      await make(t.user, {
        title: 'plano B',
        tags: ['outro'],
        link: { type: 'goal', id: t.goal.id },
      });
      await make(t.user, { title: 'plano C', tags: ['livro'] });
      const found = await page(t.user, `?q=plano&tag=livro&goalId=${t.goal.id}`);
      expect(found.items.map((n) => n.title)).toEqual(['plano']);
    });

    it('filtra por vínculo (as notas de uma meta, de um evento...)', async () => {
      const t = await withTargets();
      await make(t.user, { title: 'da meta', link: { type: 'goal', id: t.goal.id } });
      await make(t.user, { title: 'do evento', link: { type: 'event', id: t.event.id } });
      await make(t.user, { title: 'do bloco', link: { type: 'block', id: t.block.id } });
      await make(t.user, { title: 'da área', link: { type: 'area', id: t.area.id } });
      await make(t.user, { title: 'solta' });

      const titles = async (query: string) => (await page(t.user, query)).items.map((n) => n.title);
      expect(await titles(`?goalId=${t.goal.id}`)).toEqual(['da meta']);
      expect(await titles(`?eventId=${t.event.id}`)).toEqual(['do evento']);
      expect(await titles(`?blockId=${t.block.id}`)).toEqual(['do bloco']);
      expect(await titles(`?areaId=${t.area.id}`)).toEqual(['da área']);
      expect(
        (await send('get', t.user, `/api/notes?goalId=${t.goal.id}&eventId=${t.event.id}`)).status,
      ).toBe(400);
    });

    it('cada pessoa vê só as próprias notas, na lista, na busca e na paginação (RS06)', async () => {
      const [a, b] = [await registerUser(app), await registerUser(app)];
      await make(a, { title: 'segredo da Ana', content: 'palavra-secreta', tags: ['privado'] });
      await make(b, { title: 'da Bia' });

      expect((await page(b)).items.map((n) => n.title)).toEqual(['da Bia']);
      expect((await page(b, '?q=palavra-secreta')).items).toEqual([]);
      expect((await page(b, '?tag=privado')).items).toEqual([]);
      const cursorOfAna = (await page(a, '?limit=1')).nextCursor; // sem próxima: nulo
      expect(cursorOfAna).toBeNull();
    });

    it('o número de consultas não cresce com a quantidade de notas (nome do vínculo vem num join só)', async () => {
      const t = await withTargets();
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
        await page(t.user, '?limit=50');
        counting = false;
        return queries.length;
      };
      await make(t.user, { title: 'a', link: { type: 'goal', id: t.goal.id } });
      const withOne = await countFor();
      for (let i = 0; i < 12; i += 1) {
        await make(t.user, { title: `n${i}`, link: { type: 'event', id: t.event.id } });
      }
      expect(await countFor()).toBe(withOne);
      expect(withOne).toBe(1);
    });
  });

  describe('GET /notes/tags', () => {
    it('as tags da pessoa com a contagem, da mais usada para a menos usada, e em ordem alfabética no empate', async () => {
      const user = await registerUser(app);
      await make(user, { title: '1', tags: ['trabalho', 'ideias'] });
      await make(user, { title: '2', tags: ['trabalho'] });
      await make(user, { title: '3', tags: ['trabalho', 'ação'] });
      await make(user, { title: '4', tags: ['ideias'] });

      const res = await send('get', user, '/api/notes/tags');

      expect(res.status).toBe(200);
      expect(tagListSchema.parse(res.body)).toEqual([
        { tag: 'trabalho', count: 3 },
        { tag: 'ideias', count: 2 },
        { tag: 'ação', count: 1 },
      ]);
    });

    it('sem notas, lista vazia; e cada pessoa só vê as próprias tags (RS06)', async () => {
      const [a, b] = [await registerUser(app), await registerUser(app)];
      expect((await send('get', a, '/api/notes/tags')).body).toEqual([]);
      await make(a, { title: 'x', tags: ['privado'] });
      expect((await send('get', b, '/api/notes/tags')).body).toEqual([]);
    });

    it('a rota "tags" não é confundida com um id de nota', async () => {
      const user = await registerUser(app);
      const res = await send('get', user, '/api/notes/tags');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('logs sem conteúdo de notas (RS14)', () => {
    it('nem o título, nem o texto vão para o log, nem voltam num erro de validação', async () => {
      const lines: string[] = [];
      const capture = (...args: unknown[]) => void lines.push(args.map(String).join(' '));
      const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map((level) =>
        vi.spyOn(Logger.prototype, level).mockImplementation(capture),
      );
      try {
        const user = await registerUser(app);
        const marker = 'SEGREDO-DA-NOTA-8f3a';
        const note = await make(user, { title: `titulo ${marker}`, content: `texto ${marker}` });
        await send('patch', user, `/api/notes/${note.id}`, {
          title: 'y'.repeat(300),
          content: marker,
        });
        const invalid = await create(user, {
          title: marker.repeat(40),
          content: marker,
          extra: marker,
        });
        expect(invalid.status).toBe(400);
        expect(JSON.stringify(invalid.body)).not.toContain(marker);
        await send('get', user, `/api/notes?q=${marker}`);
        await send('get', user, `/api/notes/${randomUUID()}`);
        await send('delete', user, `/api/notes/${note.id}`);

        expect(lines.join('\n')).not.toContain(marker);
      } finally {
        spies.forEach((spy) => spy.mockRestore());
      }
    });
  });
});
