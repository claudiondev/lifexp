import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  generateActionToken,
  hashActionToken,
} from '../src/notifications/domain/push-action-token.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  FakeClock,
  bearer,
  createTestApp,
  listActivities,
  registerUser,
  type TestUser,
} from './helpers.js';

// Quarta 2026-10-07 às 12:00 em São Paulo (UTC-3): o bloco das 09:00-10:00 já terminou.
const NOON = '2026-10-07T15:00:00.000Z';
const OCCURRENCE_DATE = '2026-10-07';

describe('Ações pelo push: "Cumpri" e "Pulei" (e2e, RF41)', () => {
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

  const setup = async () => {
    const user = await registerUser(app);
    const [activity] = await listActivities(app, user);
    const block = await request(server()).post('/api/blocks').set(bearer(user)).send({
      recurrence: 'weekly',
      activityId: activity!.id,
      weekday: 3,
      startTime: '09:00',
      durationMin: 60,
      validFrom: '2026-09-02',
    });
    return { user, blockId: (block.body as { id: string }).id, activityName: activity!.name };
  };

  /** Cria o aviso de check-in e o token de ação, como o `PushNotifier` faria ao enviar o push. */
  const checkinToken = async (
    user: TestUser,
    blockId: string,
    options: { createdAt?: Date; expiresAt?: Date; kind?: 'CHECKIN' | 'BLOCK' } = {},
  ) => {
    // BLOCK (lembrete comum) tem a MESMA origem do CHECKIN (bloco + ocorrência): prova que é o tipo,
    // e não a origem, que a rota confere (senão o teste passaria mesmo sem checar o `kind`).
    const notification = await prisma.notification.create({
      data: {
        userId: user.userId,
        kind: options.kind ?? 'CHECKIN',
        title: 'Corrida terminou',
        body: 'Cumpriu?',
        scheduledFor: new Date(NOON),
        dedupeKey: `checkin:${blockId}:${OCCURRENCE_DATE}:${Math.random()}`,
        blockId,
        occurrenceDate: new Date(`${OCCURRENCE_DATE}T00:00:00Z`),
      },
    });
    const token = generateActionToken();
    await prisma.pushActionToken.create({
      data: {
        notificationId: notification.id,
        tokenHash: hashActionToken(token),
        // createdAt explícito: o padrão seria o relógio real da máquina, não o `FakeClock` do teste.
        createdAt: options.createdAt ?? new Date(NOON),
        expiresAt: options.expiresAt ?? new Date('2026-10-09T02:59:59.999Z'),
      },
    });
    return token;
  };

  const act = (token: string, action: 'complete' | 'skip') =>
    request(server()).post('/api/push-actions').send({ token, action });

  const completionOf = (userId: string, blockId: string) =>
    prisma.completion.findUnique({
      where: {
        blockId_occurrenceDate: {
          blockId,
          occurrenceDate: new Date(`${OCCURRENCE_DATE}T00:00:00Z`),
        },
      },
    });

  const exceptionOf = (blockId: string) =>
    prisma.blockException.findUnique({
      where: {
        blockId_occurrenceDate: {
          blockId,
          occurrenceDate: new Date(`${OCCURRENCE_DATE}T00:00:00Z`),
        },
      },
    });

  it('não pede sessão: é a rota pública do service worker (sem Authorization)', async () => {
    const { user, blockId } = await setup();
    const token = await checkinToken(user, blockId);

    expect((await act(token, 'complete')).status).toBe(200);
  });

  it('"Cumpri" conclui a ocorrência e devolve o XP ganho', async () => {
    const { user, blockId, activityName } = await setup();
    const token = await checkinToken(user, blockId);

    const res = await act(token, 'complete');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ title: `✓ ${activityName}`, body: '+60 XP' });
    expect(await completionOf(user.userId, blockId)).not.toBeNull();
  });

  it('"Pulei" pula a ocorrência, sem concluir', async () => {
    const { user, blockId, activityName } = await setup();
    const token = await checkinToken(user, blockId);

    const res = await act(token, 'skip');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ title: 'Pulado', body: activityName });
    expect(await completionOf(user.userId, blockId)).toBeNull();
    expect((await exceptionOf(blockId))?.type).toBe('SKIP');
  });

  it('clicar "Cumpri" de novo é idempotente: sem XP novo, "já estava concluído"', async () => {
    const { user, blockId, activityName } = await setup();
    const token = await checkinToken(user, blockId);
    await act(token, 'complete');

    const second = await act(token, 'complete');

    expect(second.status).toBe(200);
    expect(second.body).toEqual({ title: `✓ ${activityName}`, body: 'Já estava concluído' });
  });

  it('"Pulei" depois de concluído responde o conflito, como no app (409)', async () => {
    const { user, blockId } = await setup();
    const token = await checkinToken(user, blockId);
    await act(token, 'complete');

    expect((await act(token, 'skip')).status).toBe(409);
  });

  it('token inexistente responde 404, sem revelar se existiu', async () => {
    const res = await act('token-que-nunca-existiu', 'complete');
    expect(res.status).toBe(404);
  });

  it('token vencido responde 404', async () => {
    const { user, blockId } = await setup();
    const hourMs = 3_600_000;
    const token = await checkinToken(user, blockId, {
      createdAt: new Date(new Date(NOON).getTime() - 2 * hourMs),
      expiresAt: new Date(new Date(NOON).getTime() - hourMs), // venceu 1 h antes de "agora"
    });

    expect((await act(token, 'complete')).status).toBe(404);
    expect(await completionOf(user.userId, blockId)).toBeNull();
  });

  it('token de um aviso que não é check-in (defesa em profundidade) responde 404', async () => {
    const { user, blockId } = await setup();
    const token = await checkinToken(user, blockId, { kind: 'BLOCK' });

    expect((await act(token, 'complete')).status).toBe(404);
  });

  it('o token de uma pessoa não serve para marcar o bloco de outra (RS06)', async () => {
    const { blockId } = await setup();
    const other = await setup();
    const token = await checkinToken(other.user, blockId); // bloco de "setup()", notificação de "other"

    // a ação roda com o userId da notificação (de "other"), então não encontra o bloco de "setup()"
    expect((await act(token, 'complete')).status).toBe(404);
  });
});
