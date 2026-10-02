import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { accountExportSchema } from '@lifexp/shared';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { hashResetToken } from '../src/auth/domain/password-reset.js';
import { AccountService } from '../src/users/account.service.js';
import { EXCLUDED_FROM_EXPORT, EXPORT_KEYS } from '../src/users/domain/account-export.js';
import {
  FakeClock,
  VALID_PASSWORD,
  bearer,
  createTestApp,
  listActivities,
  refreshCookieHeader,
  registerUser,
  uniqueEmail,
  type TestUser,
} from './helpers.js';

const NOON = '2026-10-07T15:00:00.000Z'; // quarta 12:00 em São Paulo

/**
 * Modelos do `schema.prisma` que pertencem a uma pessoa: têm `userId` ou chegam a `User` por uma
 * relação obrigatória (como `Milestone`, que pertence à meta). Lido do arquivo, para que um modelo
 * novo apareça aqui sem ninguém lembrar de atualizar esta lista.
 */
function ownedModels(): string[] {
  const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  const models = new Map<string, string[]>();
  for (const match of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    models.set(match[1]!, match[2]!.split('\n'));
  }
  const parents = new Map<string, Set<string>>();
  for (const [name, lines] of models) {
    const set = new Set<string>();
    for (const line of lines) {
      // relação obrigatória: `campo Tipo @relation(fields: [...]` sem `?` no tipo
      const relation = /^\s*\w+\s+(\w+)(\?|\[\])?\s+@relation\(fields:/.exec(line);
      if (relation && !relation[2] && models.has(relation[1]!)) set.add(relation[1]!);
    }
    parents.set(name, set);
  }
  const owned = new Set<string>();
  const reaches = (name: string, seen: Set<string>): boolean => {
    if (name === 'User') return true;
    if (seen.has(name)) return false;
    seen.add(name);
    return [...(parents.get(name) ?? [])].some((parent) => reaches(parent, seen));
  };
  for (const name of models.keys()) {
    if (name !== 'User' && reaches(name, new Set())) owned.add(name);
  }
  return [...owned].sort();
}

describe('Conta: exportar e excluir os próprios dados (e2e, RF06, RS15)', () => {
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
    method: 'post' | 'put' | 'delete' | 'get' | 'patch',
    user: { accessToken: string },
    path: string,
    body?: object,
  ) => {
    const req = request(server())
      [method](path)
      .set(bearer(user as TestUser));
    return body ? req.send(body) : req;
  };
  const exportOf = async (user: TestUser) => {
    const res = await send('get', user, '/api/users/me/export');
    expect(res.status).toBe(200);
    return res;
  };
  const deleteAccount = (user: TestUser, password: unknown = VALID_PASSWORD) =>
    send('post', user, '/api/users/me/delete', { password });

  /** Uma pessoa com dados em TODAS as partes do app. */
  const fullAccount = async () => {
    const user = await registerUser(app);
    const [activity] = await listActivities(app, user);
    const areaId = activity!.areaId;

    // sessão extra (outro aparelho)
    await request(server())
      .post('/api/auth/login')
      .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0) Chrome/126.0 Safari/537.36')
      .send({ email: user.email, password: VALID_PASSWORD });

    // meta + marcos (um concluído e desfeito -> estorno) + meta concluída
    const goal = (await send('post', user, '/api/goals', { title: 'Escrever o livro', areaId }))
      .body;
    const ms = (
      await send('post', user, `/api/goals/${goal.id}/milestones`, { title: 'Capítulo 1' })
    ).body.milestones[0];
    await send('post', user, `/api/goals/${goal.id}/milestones/${ms.id}/completion`);
    await send('delete', user, `/api/goals/${goal.id}/milestones/${ms.id}/completion`);
    await send('post', user, `/api/goals/${goal.id}/milestones/${ms.id}/completion`);

    // bloco avulso concluído, bloco semanal com uma ocorrência pulada, ligado à meta
    const once = (
      await send('post', user, '/api/blocks', {
        recurrence: 'once',
        activityId: activity!.id,
        date: '2026-10-07',
        startTime: '09:00',
        durationMin: 60,
      })
    ).body;
    await send('post', user, `/api/blocks/${once.id}/occurrences/2026-10-07/completion`);
    const weekly = (
      await send('post', user, '/api/blocks', {
        recurrence: 'weekly',
        activityId: activity!.id,
        goalId: goal.id,
        weekday: 4,
        startTime: '18:00',
        durationMin: 45,
        validFrom: '2026-10-01',
        validUntil: '2026-12-31',
      })
    ).body;
    await send('put', user, `/api/blocks/${weekly.id}/exceptions/2026-10-08`, { type: 'skip' });

    // evento, preferências, aviso e token de recuperação
    await send('post', user, '/api/events', {
      title: 'Consulta',
      date: '2026-10-20',
      time: '14:30',
      category: 'medical',
      areaId,
    });
    await send('put', user, '/api/notification-preferences', { digestEmailEnabled: true });
    // o agendador de outra suíte (rodando em paralelo, no mesmo banco) pode gerar este mesmo resumo
    // para a conta recém-criada: o que importa aqui é que ele exista, não quem o criou
    await prisma.notification.createMany({
      data: [
        {
          userId: user.userId,
          kind: 'DIGEST',
          title: 'Seu dia',
          body: 'Hoje: 1 bloco.',
          scheduledFor: new Date(NOON),
          dedupeKey: 'digest:2026-10-07',
        },
      ],
      skipDuplicates: true,
    });
    await prisma.note.create({
      data: {
        userId: user.userId,
        title: 'Ideias do livro',
        content: '# Capítulo 1\n- cena inicial',
        tags: ['livro', 'ideias'],
        pinned: true,
        goalId: goal.id,
        createdAt: clock.now(),
        updatedAt: clock.now(),
      },
    });
    const quest = await prisma.weeklyQuest.create({
      data: {
        userId: user.userId,
        weekStart: new Date('2026-10-05T00:00:00.000Z'),
        createdAt: clock.now(),
      },
    });
    await prisma.questItem.create({
      data: {
        questId: quest.id,
        blockId: once.id,
        occurrenceDate: new Date('2026-10-07T00:00:00.000Z'),
        durationMin: 60,
        xp: 60,
      },
    });
    await prisma.weeklyReview.create({
      data: {
        userId: user.userId,
        weekStart: new Date('2026-10-05T00:00:00.000Z'),
        wins: 'Cumpri a rotina',
        blockers: 'Chuva',
        nextPriority: 'Entregar o relatório',
        createdAt: clock.now(),
        updatedAt: clock.now(),
      },
    });
    await prisma.passwordResetToken.create({
      data: {
        userId: user.userId,
        tokenHash: hashResetToken(randomUUID()),
        createdAt: clock.now(),
        expiresAt: new Date(clock.now().getTime() + 30 * 60_000),
      },
    });
    return { user, areaId, goal, once, weekly };
  };

  describe('teste-guarda: nenhum dado da pessoa fica de fora', () => {
    it('todo modelo que pertence a uma pessoa está na exportação ou excluído de propósito', () => {
      const decided = [...Object.keys(EXPORT_KEYS), ...Object.keys(EXCLUDED_FROM_EXPORT)].sort();
      // Um modelo novo no schema.prisma sem decisão faz este teste falhar: adicione-o a EXPORT_KEYS
      // (e a um leitor em account.service.ts) ou a EXCLUDED_FROM_EXPORT, com o motivo.
      expect(ownedModels()).toEqual(decided);
    });

    it('o detector de modelos funciona: acha os de userId e os que pertencem por relação', () => {
      const models = ownedModels();
      expect(models).toContain('Area');
      expect(models).toContain('Milestone'); // sem userId, pertence pela meta
      expect(models).toContain('BlockException'); // sem userId, pertence pelo bloco
      expect(models).not.toContain('User');
    });
  });

  describe('GET /users/me/export', () => {
    it('exige autenticação', async () => {
      expect((await request(server()).get('/api/users/me/export')).status).toBe(401);
    });

    it('devolve tudo da pessoa, no contrato, como arquivo para baixar', async () => {
      const { user } = await fullAccount();

      const res = await exportOf(user);

      const parsed = accountExportSchema.parse(res.body);
      expect(parsed.version).toBe(1);
      expect(parsed.exportedAt).toBe(NOON);
      expect(parsed.user).toMatchObject({ id: user.userId, email: user.email, name: 'Ana' });
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="lifexp-dados-2026-10-07.json"',
      );
      expect(res.headers['cache-control']).toBe('no-store');
      expect(Object.keys(parsed.data).sort()).toEqual(Object.values(EXPORT_KEYS).sort());
    });

    it('cada lista bate com o que está no banco, e nada falta nem sobra', async () => {
      const { user } = await fullAccount();
      const { data } = accountExportSchema.parse((await exportOf(user)).body);

      const expected = {
        areas: await prisma.area.count({ where: { userId: user.userId } }),
        activities: await prisma.activity.count({ where: { userId: user.userId } }),
        areaProgress: await prisma.areaProgress.count({ where: { userId: user.userId } }),
        blocks: await prisma.block.count({ where: { userId: user.userId } }),
        blockExceptions: await prisma.blockException.count({
          where: { block: { userId: user.userId } },
        }),
        completions: await prisma.completion.count({ where: { userId: user.userId } }),
        xpTransactions: await prisma.xpTransaction.count({ where: { userId: user.userId } }),
        goals: await prisma.goal.count({ where: { userId: user.userId } }),
        milestones: await prisma.milestone.count({ where: { goal: { userId: user.userId } } }),
        calendarEvents: await prisma.calendarEvent.count({ where: { userId: user.userId } }),
        notifications: await prisma.notification.count({ where: { userId: user.userId } }),
        notificationPreferences: await prisma.notificationPreference.count({
          where: { userId: user.userId },
        }),
        weeklyReviews: await prisma.weeklyReview.count({ where: { userId: user.userId } }),
        notes: await prisma.note.count({ where: { userId: user.userId } }),
        weeklyQuests: await prisma.weeklyQuest.count({ where: { userId: user.userId } }),
        questItems: await prisma.questItem.count({ where: { quest: { userId: user.userId } } }),
      };
      for (const [key, count] of Object.entries(expected)) {
        expect([key, data[key]!.length]).toEqual([key, count]);
      }
      // a conta de teste tem dados em todas as partes (senão o teste não provaria nada)
      for (const [key, count] of Object.entries(expected))
        expect([key, count > 0]).toEqual([key, true]);
    });

    it('traz o conteúdo de verdade: estorno, bloco com fim, exceção, meta e evento', async () => {
      const { user, weekly, goal } = await fullAccount();
      const { data } = accountExportSchema.parse((await exportOf(user)).body);

      expect(data.xpTransactions!.map((x) => x['type']).sort()).toEqual(
        ['COMPLETION', 'MILESTONE', 'MILESTONE', 'REVERSAL'].sort(),
      );
      const exportedWeekly = data.blocks!.find((b) => b['id'] === weekly.id)!;
      expect(exportedWeekly).toMatchObject({
        weekday: 4,
        startTime: '18:00',
        durationMin: 45,
        goalId: goal.id,
        validFrom: '2026-10-01',
        validUntil: '2026-12-31',
      });
      expect(data.blockExceptions![0]).toMatchObject({
        type: 'SKIP',
        occurrenceDate: '2026-10-08',
      });
      expect(data.goals![0]).toMatchObject({ title: 'Escrever o livro' });
      expect(data.milestones![0]).toMatchObject({ title: 'Capítulo 1', done: true });
      expect(data.calendarEvents![0]).toMatchObject({
        title: 'Consulta',
        date: '2026-10-20',
        time: '14:30',
      });
      expect(data.notificationPreferences![0]).toMatchObject({ digestEmailEnabled: true });
      expect(data.notes![0]).toMatchObject({
        title: 'Ideias do livro',
        content: '# Capítulo 1\n- cena inicial',
        tags: ['livro', 'ideias'],
        pinned: true,
        goalId: goal.id,
      });
      expect(data.weeklyReviews![0]).toMatchObject({
        weekStart: '2026-10-05',
        nextPriority: 'Entregar o relatório',
      });
    });

    it('datas civis saem como AAAA-MM-DD e instantes como ISO UTC', async () => {
      const { user } = await fullAccount();
      const { data } = accountExportSchema.parse((await exportOf(user)).body);
      const civil = /^\d{4}-\d{2}-\d{2}$/;
      const instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
      for (const block of data.blocks!) {
        expect(String(block['validFrom'] ?? block['date'])).toMatch(civil);
        expect(String(block['createdAt'])).toMatch(instant);
      }
      expect(String(data.completions![0]!['occurrenceDate'])).toMatch(civil);
      expect(String(data.completions![0]!['completedAt'])).toMatch(instant);
      expect(String(data.goals![0]!['createdAt'])).toMatch(instant);
    });

    it('nunca traz credenciais: nem hash de senha, nem de refresh token, nem de recuperação', async () => {
      const { user } = await fullAccount();
      const res = await exportOf(user);
      const text = JSON.stringify(res.body);

      const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.userId } });
      const sessions = await prisma.session.findMany({ where: { userId: user.userId } });
      const resets = await prisma.passwordResetToken.findMany({ where: { userId: user.userId } });
      expect(text).not.toContain(stored.passwordHash);
      expect(text).not.toContain('passwordHash');
      expect(text).not.toContain('argon2');
      for (const session of sessions) expect(text).not.toContain(session.refreshTokenHash);
      for (const reset of resets) expect(text).not.toContain(reset.tokenHash);
      expect(text).not.toContain('refreshTokenHash');
      expect(text).not.toContain('tokenHash');
      expect(res.body.data).not.toHaveProperty('sessions');
      expect(res.body.data).not.toHaveProperty('passwordResetTokens');
    });

    it('o serviço já monta a exportação sem credenciais (o filtro da resposta é só a segunda camada)', async () => {
      const user = await registerUser(app);
      const { body } = await app.get(AccountService).export(user.userId);
      expect(Object.keys(body.user).sort()).toEqual([
        'avatarKey',
        'createdAt',
        'email',
        'id',
        'name',
        'timezone',
      ]);
      expect(JSON.stringify(body)).not.toContain('passwordHash');
    });

    it('cada pessoa recebe só os próprios dados (RS06)', async () => {
      const [a, b] = [await fullAccount(), await fullAccount()];
      const [dataA, dataB] = [
        accountExportSchema.parse((await exportOf(a.user)).body).data,
        accountExportSchema.parse((await exportOf(b.user)).body).data,
      ];

      const idsA = new Set(Object.values(dataA).flatMap((rows) => rows.map((row) => row['id'])));
      const idsB = new Set(Object.values(dataB).flatMap((rows) => rows.map((row) => row['id'])));
      expect([...idsA].filter((id) => idsB.has(id))).toEqual([]);
      for (const rows of Object.values(dataA)) {
        for (const row of rows) {
          if ('userId' in row) expect(row['userId']).toBe(a.user.userId);
        }
      }
      for (const rows of Object.values(dataB)) {
        for (const row of rows) {
          if ('userId' in row) expect(row['userId']).toBe(b.user.userId);
        }
      }
    });

    it('conta nova exporta listas vazias, sem falhar (as áreas padrão já existem)', async () => {
      const user = await registerUser(app);
      const { data } = accountExportSchema.parse((await exportOf(user)).body);
      expect(data.areas!.length).toBeGreaterThan(0);
      expect(data.blocks).toEqual([]);
      expect(data.xpTransactions).toEqual([]);
      expect(data.goals).toEqual([]);
    });

    it('o nome do arquivo usa a data no fuso da pessoa, não a do servidor', async () => {
      const user = await registerUser(app);
      await send('patch', user, '/api/users/me', { timezone: 'Pacific/Kiritimati' }); // UTC+14
      clock.set('2026-10-07T15:00:00.000Z'); // já é dia 8 lá
      const res = await exportOf(user);
      expect(res.headers['content-disposition']).toContain('lifexp-dados-2026-10-08.json');
    });
  });

  describe('POST /users/me/delete', () => {
    it('exige autenticação', async () => {
      const res = await request(server()).post('/api/users/me/delete').send({ password: 'x' });
      expect(res.status).toBe(401);
    });

    it('senha errada responde 403 e não apaga nada', async () => {
      const { user } = await fullAccount();
      const before = await prisma.block.count({ where: { userId: user.userId } });

      const res = await deleteAccount(user, 'senha-errada-123');

      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Senha incorreta');
      expect(await prisma.user.count({ where: { id: user.userId } })).toBe(1);
      expect(await prisma.block.count({ where: { userId: user.userId } })).toBe(before);
      expect((await send('get', user, '/api/users/me')).status).toBe(200);
    });

    it('corpo inválido: sem senha, senha vazia ou campos extras (400)', async () => {
      const user = await registerUser(app);
      expect((await send('post', user, '/api/users/me/delete', {})).status).toBe(400);
      expect((await deleteAccount(user, '')).status).toBe(400);
      expect(
        (
          await send('post', user, '/api/users/me/delete', {
            password: VALID_PASSWORD,
            userId: 'x',
          })
        ).status,
      ).toBe(400);
      expect(await prisma.user.count({ where: { id: user.userId } })).toBe(1);
    });

    it('exclui a pessoa e TODOS os dados dela, em todas as tabelas', async () => {
      const { user } = await fullAccount();
      // os ids de tudo que existe antes, tabela por tabela (a exportação lista todos)
      const { data } = accountExportSchema.parse((await exportOf(user)).body);
      const tables = new Map(Object.entries(EXPORT_KEYS).map(([model, key]) => [model, key]));
      const before: [string, string[]][] = [...tables].map(([model, key]) => [
        model,
        data[key]!.map((row) => String(row['id'])),
      ]);
      const sessionIds = (await prisma.session.findMany({ where: { userId: user.userId } })).map(
        (s) => s.id,
      );
      const resetIds = (
        await prisma.passwordResetToken.findMany({ where: { userId: user.userId } })
      ).map((r) => r.id);
      before.push(['Session', sessionIds], ['PasswordResetToken', resetIds]);
      for (const [, ids] of before) expect(ids.length).toBeGreaterThan(0);

      const res = await deleteAccount(user);

      expect(res.status).toBe(204);
      expect(await prisma.user.count({ where: { id: user.userId } })).toBe(0);
      for (const [model, ids] of before) {
        const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
          `SELECT count(*) AS n FROM "${model}" WHERE "id" = ANY($1::text[])`,
          ids,
        );
        expect([model, Number(rows[0]!.n)]).toEqual([model, 0]);
      }
    });

    it('não toca nos dados de outras pessoas', async () => {
      const [a, b] = [await fullAccount(), await fullAccount()];
      const snapshot = async () => {
        const { data } = accountExportSchema.parse((await exportOf(b.user)).body);
        return Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, rows.length]));
      };
      const before = await snapshot();

      expect((await deleteAccount(a.user)).status).toBe(204);

      expect(await snapshot()).toEqual(before);
      expect((await send('get', b.user, '/api/users/me')).status).toBe(200);
    });

    it('a sessão acaba na hora: limpa o cookie, derruba o token e a renovação', async () => {
      const user = await registerUser(app);
      const login = await request(server())
        .post('/api/auth/login')
        .send({ email: user.email, password: VALID_PASSWORD });
      const cookie = refreshCookieHeader(login);

      const res = await deleteAccount(user);

      expect(res.status).toBe(204);
      const cookies = (res.headers['set-cookie'] as unknown as string[]) ?? [];
      expect(cookies.some((c) => c.startsWith('refresh_token=;'))).toBe(true);
      expect((await send('get', user, '/api/users/me')).status).toBe(401);
      expect((await request(server()).post('/api/auth/refresh').set('Cookie', cookie)).status).toBe(
        401,
      );
    });

    it('não dá mais para entrar, e o mesmo e-mail pode abrir uma conta nova, vazia', async () => {
      const { user } = await fullAccount();
      await deleteAccount(user);

      const login = await request(server())
        .post('/api/auth/login')
        .send({ email: user.email, password: VALID_PASSWORD });
      expect(login.status).toBe(401);

      const again = await request(server())
        .post('/api/auth/register')
        .send({ name: 'Ana', email: user.email, password: VALID_PASSWORD });
      expect(again.status).toBe(201);
      expect(again.body.user.id).not.toBe(user.userId);
      const fresh = {
        accessToken: again.body.accessToken,
        userId: again.body.user.id,
        email: user.email,
      };
      const { data } = accountExportSchema.parse((await exportOf(fresh)).body);
      expect(data.goals).toEqual([]);
      expect(data.xpTransactions).toEqual([]);
    });

    it('é seguro repetir: dois pedidos em paralelo, um só apaga e o outro não dá erro 500', async () => {
      const { user } = await fullAccount();
      const results = await Promise.all([deleteAccount(user), deleteAccount(user)]);
      for (const res of results) expect([204, 401]).toContain(res.status);
      expect(results.some((res) => res.status === 204)).toBe(true);
      expect(await prisma.user.count({ where: { id: user.userId } })).toBe(0);
    });

    it('excluir uma conta que já não existe não é erro (pedido repetido)', async () => {
      const service = app.get(AccountService);
      await expect(service.deleteAccount(randomUUID(), 'qualquer')).resolves.toBeUndefined();
    });

    it('o e-mail de quem tem conta com e-mail repetido de outra pessoa não importa: só a dona do token é apagada', async () => {
      const [a, b] = [await registerUser(app), await registerUser(app)];
      // tentar apagar "a conta do outro" não é possível: o alvo vem sempre do token (RN39)
      const res = await send('post', a, '/api/users/me/delete', {
        password: VALID_PASSWORD,
        email: b.email,
      });
      expect(res.status).toBe(400);
      expect(await prisma.user.count({ where: { id: { in: [a.userId, b.userId] } } })).toBe(2);

      expect((await deleteAccount(a)).status).toBe(204);
      expect(await prisma.user.count({ where: { id: a.userId } })).toBe(0);
      expect(await prisma.user.count({ where: { id: b.userId } })).toBe(1);
    });

    it('a conta apagada tem o e-mail livre mesmo com letras diferentes no cadastro novo', async () => {
      const email = uniqueEmail();
      const first = await request(server())
        .post('/api/auth/register')
        .send({ name: 'Ana', email, password: VALID_PASSWORD });
      await deleteAccount({
        accessToken: first.body.accessToken,
        userId: first.body.user.id,
        email,
      });
      const second = await request(server())
        .post('/api/auth/register')
        .send({ name: 'Bia', email: email.toUpperCase(), password: VALID_PASSWORD });
      expect(second.status).toBe(201);
    });
  });
});
