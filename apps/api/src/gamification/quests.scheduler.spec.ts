import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import type { Clock } from '../clock/clock.js';
import type { Env } from '../config/env.schema.js';
import { JobMonitor } from '../observability/job-monitor.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { QuestsScheduler } from './quests.scheduler.js';
import type { QuestService } from './quest.service.js';

const NOW = new Date('2026-10-07T11:45:20.000Z');

function build(enabled = true) {
  const monitor = new JobMonitor();
  const config = { get: () => enabled } as unknown as ConfigService<Env, true>;
  const clock: Clock = { now: () => NOW };
  const scheduler = new QuestsScheduler(
    {} as PrismaService,
    {} as QuestService,
    config,
    monitor,
    clock,
  );
  return { scheduler, monitor };
}

describe('QuestsScheduler.tick', () => {
  it('registra a execução no monitor e usa a hora do relógio injetado', async () => {
    const { scheduler, monitor } = build();
    const runOnce = vi
      .spyOn(scheduler, 'runOnce')
      .mockResolvedValue({ users: 4, created: 2, failures: 0 });

    await scheduler.tick();

    expect(runOnce).toHaveBeenCalledWith(NOW);
    expect(monitor.snapshot().jobs[0]).toMatchObject({
      name: 'quests-snapshot',
      lastStatus: 'ok',
      consecutiveFailures: 0,
    });
  });

  it('uma falha é identificada no monitor e não derruba o agendador', async () => {
    const { scheduler, monitor } = build();
    vi.spyOn(scheduler, 'runOnce').mockRejectedValue(new Error('banco fora do ar'));

    await expect(scheduler.tick()).resolves.toBeUndefined();

    expect(monitor.snapshot().jobs[0]).toMatchObject({
      name: 'quests-snapshot',
      lastStatus: 'failed',
      consecutiveFailures: 1,
    });
  });

  it('com a trava de outra instância, a execução conta como pulada', async () => {
    const { scheduler, monitor } = build();
    vi.spyOn(scheduler, 'runOnce').mockResolvedValue(null);

    await scheduler.tick();

    expect(monitor.snapshot().jobs[0]).toMatchObject({ lastStatus: 'skipped' });
  });

  it('desligado por configuração, não roda nem aparece nos jobs', async () => {
    const { scheduler, monitor } = build(false);
    const runOnce = vi.spyOn(scheduler, 'runOnce');

    await scheduler.tick();

    expect(runOnce).not.toHaveBeenCalled();
    expect(monitor.snapshot().jobs).toEqual([]);
  });
});
