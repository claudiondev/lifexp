import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bearer, createTestApp, registerUser } from './helpers.js';

describe('Perfil (e2e)', () => {
  let app: INestApplication;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const patchMe = (user: Awaited<ReturnType<typeof registerUser>>, body: object) =>
    request(server()).patch('/api/users/me').set(bearer(user)).send(body);

  it('exige autenticação', async () => {
    expect((await request(server()).patch('/api/users/me').send({ name: 'X' })).status).toBe(401);
  });

  it('a conta nasce com o emblema padrão', async () => {
    const user = await registerUser(app);
    const me = await request(server()).get('/api/users/me').set(bearer(user));
    expect(me.body.avatarKey).toBe('swords');
  });

  it('altera nome, fuso e emblema, e as mudanças persistem', async () => {
    const user = await registerUser(app);

    const res = await patchMe(user, {
      name: '  Maria  ',
      timezone: 'America/Manaus',
      avatarKey: 'crown',
    });
    const me = await request(server()).get('/api/users/me').set(bearer(user));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: 'Maria',
      timezone: 'America/Manaus',
      avatarKey: 'crown',
    });
    expect(me.body).toMatchObject({
      name: 'Maria',
      timezone: 'America/Manaus',
      avatarKey: 'crown',
    });
  });

  it('altera apenas o que foi enviado', async () => {
    const user = await registerUser(app);
    const res = await patchMe(user, { avatarKey: 'moon' });
    expect(res.body).toMatchObject({
      name: 'Ana',
      timezone: 'America/Sao_Paulo',
      avatarKey: 'moon',
    });
  });

  it('rejeita fuso inexistente, emblema fora da lista, nome vazio e corpo vazio com 400', async () => {
    const user = await registerUser(app);
    expect((await patchMe(user, { timezone: 'Marte/Olympus' })).status).toBe(400);
    expect((await patchMe(user, { avatarKey: 'dragao' })).status).toBe(400);
    expect((await patchMe(user, { name: '  ' })).status).toBe(400);
    expect((await patchMe(user, {})).status).toBe(400);
  });

  it('não deixa alterar e-mail, senha ou id por aqui (campos extras, RS07)', async () => {
    const user = await registerUser(app);
    expect((await patchMe(user, { email: 'novo@test.dev' })).status).toBe(400);
    expect((await patchMe(user, { passwordHash: 'x' })).status).toBe(400);
    expect((await patchMe(user, { id: '0192f1a0-7b3c-7000-8000-000000000001' })).status).toBe(400);

    const me = await request(server()).get('/api/users/me').set(bearer(user));
    expect(me.body.email).toBe(user.email);
  });

  it('só altera quem está no token, nunca outra pessoa (RN39)', async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);

    await patchMe(a, { name: 'Somente A' });

    const meB = await request(server()).get('/api/users/me').set(bearer(b));
    expect(meB.body.name).toBe('Ana');
  });
});
