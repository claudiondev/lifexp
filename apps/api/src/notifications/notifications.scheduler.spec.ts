import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { Clock } from '../clock/clock.js';
import type { Env } from '../config/env.schema.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { DigestEmailService } from './digest-email.service.js';
import type { NotificationGenerator, ScanSummary } from './notification-generator.service.js';
import { NotificationsScheduler } from './notifications.scheduler.js';

const NOW = new Date('2026-10-07T11:45:20.000Z');

function build(
  options: { enabled?: boolean; locked?: boolean; scan?: () => Promise<ScanSummary> } = {},
) {
  const scanAll = vi.fn(options.scan ?? (async () => ({ users: 2, created: 3, failures: 0 })));
  const generator = { scanAll } as unknown as NotificationGenerator;
  const sendPending = vi.fn(async () => ({ sent: 1, failed: 0 }));
  const digestEmail = { sendPending } as unknown as DigestEmailService;
  const queryRaw = vi.fn(async () => [{ locked: options.locked ?? true }]);
  const prisma = {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ $queryRaw: queryRaw }),
  } as unknown as PrismaService;
  const config = { get: () => options.enabled ?? true } as unknown as ConfigService<Env, true>;
  const clock: Clock = { now: () => NOW };
  return {
    scheduler: new NotificationsScheduler(generator, digestEmail, prisma, config, clock),
    scanAll,
    sendPending,
    queryRaw,
  };
}

describe('NotificationsScheduler', () => {
  it('a cada minuto varre com a hora do relógio injetado', async () => {
    const { scheduler, scanAll } = build();
    await scheduler.tick();
    expect(scanAll).toHaveBeenCalledTimes(1);
    expect(scanAll).toHaveBeenCalledWith(NOW);
  });

  it('desligado por configuração, não varre nem toca no banco', async () => {
    const { scheduler, scanAll, queryRaw } = build({ enabled: false });
    await scheduler.tick();
    expect(scanAll).not.toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('com a trava ocupada por outra instância, pula a varredura e o envio de e-mails', async () => {
    const { scheduler, scanAll, sendPending } = build({ locked: false });
    expect(await scheduler.runOnce(NOW)).toBeNull();
    expect(scanAll).not.toHaveBeenCalled();
    expect(sendPending).not.toHaveBeenCalled();
  });

  it('depois de gerar os avisos, envia os e-mails pendentes (com a hora injetada)', async () => {
    const { scheduler, sendPending } = build();
    await scheduler.tick();
    expect(sendPending).toHaveBeenCalledWith(NOW);
  });

  it('com a trava livre, varre e devolve o resumo', async () => {
    const { scheduler } = build();
    expect(await scheduler.runOnce(NOW)).toEqual({
      users: 2,
      created: 3,
      failures: 0,
      emailed: 1,
      emailFailures: 0,
    });
  });

  it('uma falha na varredura é registrada e nunca derruba o agendador', async () => {
    const { scheduler } = build({
      scan: async () => {
        throw new Error('banco fora do ar');
      },
    });
    await expect(scheduler.tick()).resolves.toBeUndefined();
  });
});
