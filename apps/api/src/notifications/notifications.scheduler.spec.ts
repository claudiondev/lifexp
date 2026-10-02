import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { Clock } from '../clock/clock.js';
import type { Env } from '../config/env.schema.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { DigestEmailService } from './digest-email.service.js';
import type { NotificationGenerator, ScanSummary } from './notification-generator.service.js';
import { JobMonitor } from '../observability/job-monitor.js';
import type { PushNotifier } from './push-notifier.service.js';
import { NotificationsScheduler } from './notifications.scheduler.js';

const NOW = new Date('2026-10-07T11:45:20.000Z');

function build(
  options: { enabled?: boolean; locked?: boolean; scan?: () => Promise<ScanSummary> } = {},
) {
  const scanAll = vi.fn(options.scan ?? (async () => ({ users: 2, created: 3, failures: 0 })));
  const generator = { scanAll } as unknown as NotificationGenerator;
  const sendPending = vi.fn(async () => ({ sent: 1, failed: 0 }));
  const digestEmail = { sendPending } as unknown as DigestEmailService;
  const sendPush = vi.fn(async () => ({ sent: 2, failed: 0, removed: 0 }));
  const push = { sendPending: sendPush } as unknown as PushNotifier;
  const queryRaw = vi.fn(async () => [{ locked: options.locked ?? true }]);
  const prisma = {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ $queryRaw: queryRaw }),
  } as unknown as PrismaService;
  const config = { get: () => options.enabled ?? true } as unknown as ConfigService<Env, true>;
  const clock: Clock = { now: () => NOW };
  const monitor = new JobMonitor();
  return {
    monitor,
    scheduler: new NotificationsScheduler(
      generator,
      digestEmail,
      push,
      monitor,
      prisma,
      config,
      clock,
    ),
    scanAll,
    sendPending,
    sendPush,
    queryRaw,
  };
}

describe('NotificationsScheduler', () => {
  it('depois de varrer, envia e-mails e push e devolve os números dos dois', async () => {
    const { scheduler, sendPending, sendPush } = build();
    const summary = await scheduler.runOnce(NOW);
    expect(sendPending).toHaveBeenCalledWith(NOW);
    expect(sendPush).toHaveBeenCalledWith(NOW);
    expect(summary).toMatchObject({ emailed: 1, pushed: 2, pushFailures: 0 });
  });

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

  it('com a trava ocupada por outra instância, pula a varredura, o envio de e-mails e o de push', async () => {
    const { scheduler, scanAll, sendPending, sendPush } = build({ locked: false });
    expect(await scheduler.runOnce(NOW)).toBeNull();
    expect(sendPush).not.toHaveBeenCalled();
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
      pushed: 2,
      pushFailures: 0,
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

  it('o resultado de cada varredura fica no monitor: ok, falhou (identificado) ou pulada', async () => {
    const ok = build();
    await ok.scheduler.tick();
    expect(ok.monitor.snapshot().jobs[0]).toMatchObject({
      name: 'notifications-scan',
      lastStatus: 'ok',
      consecutiveFailures: 0,
    });

    const failing = build({
      scan: async () => {
        throw new Error('banco fora do ar');
      },
    });
    await failing.scheduler.tick();
    await failing.scheduler.tick();
    expect(failing.monitor.snapshot().jobs[0]).toMatchObject({
      lastStatus: 'failed',
      consecutiveFailures: 2,
    });

    const busy = build({ locked: false });
    await busy.scheduler.tick();
    expect(busy.monitor.snapshot().jobs[0]).toMatchObject({ lastStatus: 'skipped' });
  });

  it('desligado por configuração, não aparece nos jobs (não é falha nem execução)', async () => {
    const { scheduler, monitor } = build({ enabled: false });
    await scheduler.tick();
    expect(monitor.snapshot().jobs).toEqual([]);
  });
});
