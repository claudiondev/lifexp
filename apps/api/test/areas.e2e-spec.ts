import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { areaSchema, type Area } from '@lifexp/shared';
import { DEFAULT_AREAS } from '../src/areas/domain/default-areas.js';
import { bearer, createTestApp, registerUser, type TestUser } from './helpers.js';

describe('Áreas (e2e)', () => {
  let app: INestApplication;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const listAreas = async (user: TestUser, includeArchived = false): Promise<Area[]> => {
    const res = await request(server())
      .get(`/api/areas?includeArchived=${includeArchived}`)
      .set(bearer(user));
    return res.body;
  };

  const createArea = (user: TestUser, body: object) =>
    request(server()).post('/api/areas').set(bearer(user)).send(body);

  describe('GET /areas', () => {
    it('exige autenticação', async () => {
      expect((await request(server()).get('/api/areas')).status).toBe(401);
    });

    it('lista as áreas padrão em ordem, no contrato do schema compartilhado', async () => {
      const user = await registerUser(app);
      const areas = await listAreas(user);

      expect(areas.map((area) => area.name)).toEqual(DEFAULT_AREAS.map((area) => area.name));
      expect(areas.every((area) => areaSchema.safeParse(area).success)).toBe(true);
    });

    it('rejeita includeArchived inválido com 400', async () => {
      const user = await registerUser(app);
      const res = await request(server())
        .get('/api/areas?includeArchived=talvez')
        .set(bearer(user));
      expect(res.status).toBe(400);
    });
  });

  describe('POST /areas', () => {
    it('cria a área no fim da lista', async () => {
      const user = await registerUser(app);
      const res = await createArea(user, { name: 'Música', color: 'pink', icon: 'music' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: 'Música', color: 'pink', archivedAt: null });
      const areas = await listAreas(user);
      expect(areas.at(-1)?.id).toBe(res.body.id);
      expect(res.body.position).toBeGreaterThan(areas.at(-2)?.position ?? -1);
    });

    it('rejeita nome repetido entre áreas ativas, ignorando maiúsculas, com 409', async () => {
      const user = await registerUser(app);
      const res = await createArea(user, { name: 'trabalho', color: 'pink', icon: 'music' });
      expect(res.status).toBe(409);
    });

    it('rejeita cor, ícone ou nome inválidos com 400', async () => {
      const user = await registerUser(app);
      expect((await createArea(user, { name: 'X', color: 'neon', icon: 'music' })).status).toBe(
        400,
      );
      expect((await createArea(user, { name: 'X', color: 'pink', icon: 'zzz' })).status).toBe(400);
      expect((await createArea(user, { name: ' ', color: 'pink', icon: 'music' })).status).toBe(
        400,
      );
    });

    it('permite o mesmo nome para pessoas diferentes', async () => {
      const a = await registerUser(app);
      const b = await registerUser(app);
      expect((await createArea(a, { name: 'Música', color: 'pink', icon: 'music' })).status).toBe(
        201,
      );
      expect((await createArea(b, { name: 'Música', color: 'pink', icon: 'music' })).status).toBe(
        201,
      );
    });
  });

  describe('PATCH /areas/:id', () => {
    it('altera só os campos enviados', async () => {
      const user = await registerUser(app);
      const [first] = await listAreas(user);

      const res = await request(server())
        .patch(`/api/areas/${first!.id}`)
        .set(bearer(user))
        .send({ color: 'sky' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: first!.id, name: first!.name, color: 'sky' });
    });

    it('rejeita renomear para o nome de outra área ativa com 409', async () => {
      const user = await registerUser(app);
      const [first] = await listAreas(user);
      const res = await request(server())
        .patch(`/api/areas/${first!.id}`)
        .set(bearer(user))
        .send({ name: 'ESTUDO' });
      expect(res.status).toBe(409);
    });

    it('aceita "renomear" para o próprio nome apenas trocando maiúsculas', async () => {
      const user = await registerUser(app);
      const [first] = await listAreas(user);
      const res = await request(server())
        .patch(`/api/areas/${first!.id}`)
        .set(bearer(user))
        .send({ name: first!.name.toUpperCase() });
      expect(res.status).toBe(200);
    });

    it('rejeita corpo vazio e id que não é UUID com 400', async () => {
      const user = await registerUser(app);
      const [first] = await listAreas(user);
      const empty = await request(server())
        .patch(`/api/areas/${first!.id}`)
        .set(bearer(user))
        .send({});
      const badId = await request(server())
        .patch('/api/areas/abc')
        .set(bearer(user))
        .send({ name: 'X' });
      expect(empty.status).toBe(400);
      expect(badId.status).toBe(400);
    });
  });

  describe('arquivar e restaurar', () => {
    it('esconde a área da lista padrão e a mostra com includeArchived', async () => {
      const user = await registerUser(app);
      const [first] = await listAreas(user);

      const archived = await request(server())
        .post(`/api/areas/${first!.id}/archive`)
        .set(bearer(user));

      expect(archived.status).toBe(200);
      expect(archived.body.archivedAt).not.toBeNull();
      expect((await listAreas(user)).some((area) => area.id === first!.id)).toBe(false);
      expect((await listAreas(user, true)).some((area) => area.id === first!.id)).toBe(true);
    });

    it('arquivar de novo é idempotente e mantém a data original', async () => {
      const user = await registerUser(app);
      const [first] = await listAreas(user);
      const one = await request(server()).post(`/api/areas/${first!.id}/archive`).set(bearer(user));
      const two = await request(server()).post(`/api/areas/${first!.id}/archive`).set(bearer(user));
      expect(two.status).toBe(200);
      expect(two.body.archivedAt).toBe(one.body.archivedAt);
    });

    it('restaura a área arquivada', async () => {
      const user = await registerUser(app);
      const [first] = await listAreas(user);
      await request(server()).post(`/api/areas/${first!.id}/archive`).set(bearer(user));

      const res = await request(server())
        .post(`/api/areas/${first!.id}/unarchive`)
        .set(bearer(user));

      expect(res.status).toBe(200);
      expect(res.body.archivedAt).toBeNull();
      expect((await listAreas(user)).some((area) => area.id === first!.id)).toBe(true);
    });

    it('arquivada libera o nome; ao restaurar com o nome em uso responde 409', async () => {
      const user = await registerUser(app);
      const [first] = await listAreas(user);
      await request(server()).post(`/api/areas/${first!.id}/archive`).set(bearer(user));

      const reused = await createArea(user, { name: first!.name, color: 'pink', icon: 'music' });
      const restore = await request(server())
        .post(`/api/areas/${first!.id}/unarchive`)
        .set(bearer(user));

      expect(reused.status).toBe(201);
      expect(restore.status).toBe(409);
    });
  });

  describe('isolamento entre usuários (RS06, RN39)', () => {
    it('a lista de B nunca contém áreas de A', async () => {
      const a = await registerUser(app);
      const b = await registerUser(app);
      const idsOfA = new Set((await listAreas(a)).map((area) => area.id));

      const idsOfB = (await listAreas(b, true)).map((area) => area.id);

      expect(idsOfB.some((id) => idsOfA.has(id))).toBe(false);
    });

    it('B não consegue editar, arquivar nem restaurar uma área de A: responde 404', async () => {
      const a = await registerUser(app);
      const b = await registerUser(app);
      const [areaOfA] = await listAreas(a);

      const patch = await request(server())
        .patch(`/api/areas/${areaOfA!.id}`)
        .set(bearer(b))
        .send({ name: 'Invadida' });
      const archive = await request(server())
        .post(`/api/areas/${areaOfA!.id}/archive`)
        .set(bearer(b));
      const unarchive = await request(server())
        .post(`/api/areas/${areaOfA!.id}/unarchive`)
        .set(bearer(b));

      expect([patch.status, archive.status, unarchive.status]).toEqual([404, 404, 404]);
      const after = (await listAreas(a)).find((area) => area.id === areaOfA!.id);
      expect(after).toEqual(areaOfA);
    });

    it('o 404 de área alheia é igual ao de uma área que não existe', async () => {
      const a = await registerUser(app);
      const b = await registerUser(app);
      const [areaOfA] = await listAreas(a);
      const missing = '0192f1a0-7b3c-7000-8000-000000000999';

      const foreign = await request(server())
        .post(`/api/areas/${areaOfA!.id}/archive`)
        .set(bearer(b));
      const absent = await request(server()).post(`/api/areas/${missing}/archive`).set(bearer(b));

      expect(foreign.status).toBe(absent.status);
      expect(foreign.body).toEqual(absent.body);
    });
  });
});
