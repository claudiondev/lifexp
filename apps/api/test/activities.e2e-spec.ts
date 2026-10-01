import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { activitySchema, type Activity, type Area } from '@lifexp/shared';
import { bearer, createTestApp, registerUser, type TestUser } from './helpers.js';

describe('Atividades (e2e)', () => {
  let app: INestApplication;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const listAreas = async (user: TestUser): Promise<Area[]> =>
    (await request(server()).get('/api/areas?includeArchived=true').set(bearer(user))).body;

  const listActivities = async (user: TestUser, query = ''): Promise<Activity[]> =>
    (await request(server()).get(`/api/activities${query}`).set(bearer(user))).body;

  const createActivity = (user: TestUser, body: object) =>
    request(server()).post('/api/activities').set(bearer(user)).send(body);

  /** Pessoa nova + a primeira área padrão, para os testes não dependerem uns dos outros. */
  const setup = async () => {
    const user = await registerUser(app);
    const [area] = await listAreas(user);
    return { user, area: area! };
  };

  describe('GET /activities', () => {
    it('exige autenticação', async () => {
      expect((await request(server()).get('/api/activities')).status).toBe(401);
    });

    it('lista as atividades padrão (uma por área) no contrato compartilhado', async () => {
      const { user, area } = await setup();
      const all = await listActivities(user);
      const ofArea = await listActivities(user, `?areaId=${area.id}`);

      expect(all).toHaveLength(7);
      expect(all.every((activity) => activitySchema.safeParse(activity).success)).toBe(true);
      expect(ofArea).toHaveLength(1);
      expect(ofArea[0]).toMatchObject({ name: area.name, xpWeight: 1, areaId: area.id });
    });
  });

  describe('POST /activities', () => {
    it('cria com peso padrão 1,0', async () => {
      const { user, area } = await setup();
      const res = await createActivity(user, { areaId: area.id, name: 'Reunião' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: 'Reunião', xpWeight: 1, areaId: area.id });
    });

    it('aceita os limites do peso (0,5 e 2,0) e rejeita fora deles (RN02)', async () => {
      const { user, area } = await setup();
      const make = (name: string, xpWeight: number) =>
        createActivity(user, { areaId: area.id, name, xpWeight });

      expect((await make('Min', 0.5)).status).toBe(201);
      expect((await make('Max', 2)).status).toBe(201);
      expect((await make('Abaixo', 0.4)).status).toBe(400);
      expect((await make('Acima', 2.1)).status).toBe(400);
    });

    it('rejeita nome repetido na mesma área com 409, mas aceita em outra área', async () => {
      const { user, area } = await setup();
      const areas = await listAreas(user);
      await createActivity(user, { areaId: area.id, name: 'Foco' });

      const same = await createActivity(user, { areaId: area.id, name: 'FOCO' });
      const other = await createActivity(user, { areaId: areas[1]!.id, name: 'Foco' });

      expect(same.status).toBe(409);
      expect(other.status).toBe(201);
    });

    it('rejeita criar em área arquivada com 409', async () => {
      const { user, area } = await setup();
      await request(server()).post(`/api/areas/${area.id}/archive`).set(bearer(user));
      const res = await createActivity(user, { areaId: area.id, name: 'Nova' });
      expect(res.status).toBe(409);
    });

    it('rejeita campos extras como userId com 400 (RS07)', async () => {
      const { user, area } = await setup();
      const res = await createActivity(user, { areaId: area.id, name: 'X', userId: 'outro' });
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /activities/:id', () => {
    it('altera nome e peso', async () => {
      const { user, area } = await setup();
      const [activity] = await listActivities(user, `?areaId=${area.id}`);

      const res = await request(server())
        .patch(`/api/activities/${activity!.id}`)
        .set(bearer(user))
        .send({ name: 'Deep work', xpWeight: 1.5 });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: activity!.id, name: 'Deep work', xpWeight: 1.5 });
    });

    it('não permite mover a atividade de área (areaId é campo extra)', async () => {
      const { user, area } = await setup();
      const areas = await listAreas(user);
      const [activity] = await listActivities(user, `?areaId=${area.id}`);

      const res = await request(server())
        .patch(`/api/activities/${activity!.id}`)
        .set(bearer(user))
        .send({ areaId: areas[1]!.id });

      expect(res.status).toBe(400);
    });

    it('rejeita renomear para nome já usado na área com 409', async () => {
      const { user, area } = await setup();
      const created = await createActivity(user, { areaId: area.id, name: 'Foco' });

      const res = await request(server())
        .patch(`/api/activities/${created.body.id}`)
        .set(bearer(user))
        .send({ name: area.name.toLowerCase() });

      expect(res.status).toBe(409);
    });
  });

  describe('arquivar e restaurar', () => {
    it('esconde da lista padrão e mostra com includeArchived', async () => {
      const { user, area } = await setup();
      const [activity] = await listActivities(user, `?areaId=${area.id}`);

      const res = await request(server())
        .post(`/api/activities/${activity!.id}/archive`)
        .set(bearer(user));

      expect(res.status).toBe(200);
      expect(res.body.archivedAt).not.toBeNull();
      expect(await listActivities(user, `?areaId=${area.id}`)).toHaveLength(0);
      expect(await listActivities(user, `?areaId=${area.id}&includeArchived=true`)).toHaveLength(1);
    });

    it('arquivar uma área esconde as atividades dela, sem alterá-las', async () => {
      const { user, area } = await setup();
      await request(server()).post(`/api/areas/${area.id}/archive`).set(bearer(user));

      expect(await listActivities(user, `?areaId=${area.id}`)).toHaveLength(0);
      const all = await listActivities(user, `?areaId=${area.id}&includeArchived=true`);
      expect(all[0]?.archivedAt).toBeNull();
    });

    it('restaura a atividade arquivada', async () => {
      const { user, area } = await setup();
      const [activity] = await listActivities(user, `?areaId=${area.id}`);
      await request(server()).post(`/api/activities/${activity!.id}/archive`).set(bearer(user));

      const res = await request(server())
        .post(`/api/activities/${activity!.id}/unarchive`)
        .set(bearer(user));

      expect(res.status).toBe(200);
      expect(res.body.archivedAt).toBeNull();
      expect(await listActivities(user, `?areaId=${area.id}`)).toHaveLength(1);
    });

    it('não restaura atividade cuja área está arquivada (409)', async () => {
      const { user, area } = await setup();
      const [activity] = await listActivities(user, `?areaId=${area.id}`);
      await request(server()).post(`/api/activities/${activity!.id}/archive`).set(bearer(user));
      await request(server()).post(`/api/areas/${area.id}/archive`).set(bearer(user));

      const res = await request(server())
        .post(`/api/activities/${activity!.id}/unarchive`)
        .set(bearer(user));

      expect(res.status).toBe(409);
    });
  });

  describe('isolamento entre usuários (RS06, RN39)', () => {
    it('B não cria atividade em área de A: responde 404', async () => {
      const a = await setup();
      const b = await registerUser(app);
      const res = await createActivity(b, { areaId: a.area.id, name: 'Invasora' });
      expect(res.status).toBe(404);
      expect(await listActivities(a.user, `?areaId=${a.area.id}`)).toHaveLength(1);
    });

    it('B não edita, arquiva nem restaura atividade de A: responde 404', async () => {
      const a = await setup();
      const b = await registerUser(app);
      const [activity] = await listActivities(a.user, `?areaId=${a.area.id}`);

      const patch = await request(server())
        .patch(`/api/activities/${activity!.id}`)
        .set(bearer(b))
        .send({ name: 'Invadida' });
      const archive = await request(server())
        .post(`/api/activities/${activity!.id}/archive`)
        .set(bearer(b));
      const unarchive = await request(server())
        .post(`/api/activities/${activity!.id}/unarchive`)
        .set(bearer(b));

      expect([patch.status, archive.status, unarchive.status]).toEqual([404, 404, 404]);
      expect(await listActivities(a.user, `?areaId=${a.area.id}`)).toEqual([activity]);
    });

    it('listar por areaId de outra pessoa devolve vazio, sem revelar nada', async () => {
      const a = await setup();
      const b = await registerUser(app);
      expect(await listActivities(b, `?areaId=${a.area.id}&includeArchived=true`)).toEqual([]);
    });
  });
});
