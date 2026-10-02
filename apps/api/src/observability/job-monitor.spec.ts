import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEGRADED_AFTER_FAILURES, JobMonitor } from './job-monitor.js';

describe('JobMonitor', () => {
  let monitor: JobMonitor;
  const log = vi.spyOn(Logger.prototype, 'log');
  const debug = vi.spyOn(Logger.prototype, 'debug');
  const error = vi.spyOn(Logger.prototype, 'error');
  let clockMs = Date.parse('2026-10-07T10:00:00.000Z');
  const now = () => clockMs;

  beforeEach(() => {
    monitor = new JobMonitor();
    for (const spy of [log, debug, error]) spy.mockImplementation(() => undefined);
    clockMs = Date.parse('2026-10-07T10:00:00.000Z');
  });
  afterEach(() => vi.clearAllMocks());

  it('execução boa: registra ok, quando foi, quanto durou e a última vez que deu certo', async () => {
    await monitor.track(
      'varredura',
      async () => {
        clockMs += 250;
        return { created: 3 };
      },
      now,
    );

    expect(monitor.snapshot()).toEqual({
      status: 'ok',
      jobs: [
        {
          name: 'varredura',
          lastRunAt: '2026-10-07T10:00:00.000Z',
          lastStatus: 'ok',
          lastDurationMs: 250,
          lastSuccessAt: '2026-10-07T10:00:00.000Z',
          consecutiveFailures: 0,
        },
      ],
    });
  });

  it('só registra em nível normal quando houve trabalho; execução vazia vai para debug', async () => {
    await monitor.track('a', async () => ({ created: 0, users: 0 }), now);
    expect(log).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledTimes(1);

    await monitor.track('a', async () => ({ created: 2, users: 1 }), now);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'job_ok', job: 'a', created: 2, users: 1 }),
    );
  });

  it('falha: não lança, registra job_failed com o erro redigido e conta as falhas seguidas', async () => {
    await expect(
      monitor.track(
        'varredura',
        async () => {
          throw new Error('não conectou em postgresql://app:senhaforte@db/x para ana@exemplo.com');
        },
        now,
      ),
    ).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledTimes(1);
    const entry = error.mock.calls[0]![0] as Record<string, unknown>;
    expect(entry).toMatchObject({
      event: 'job_failed',
      job: 'varredura',
      consecutiveFailures: 1,
      errorName: 'Error',
    });
    expect(String(entry['error'])).not.toMatch(/senhaforte|ana@/);
    expect(monitor.snapshot().jobs[0]).toMatchObject({
      lastStatus: 'failed',
      consecutiveFailures: 1,
      lastSuccessAt: null,
    });
  });

  it('o erro registrado é cortado (mensagem enorme não vira linha enorme)', async () => {
    await monitor.track(
      'x',
      async () => {
        throw new Error('erro '.repeat(2000));
      },
      now,
    );
    const entry = error.mock.calls[0]![0] as { error: string };
    expect(entry.error.length).toBeLessThanOrEqual(300);
  });

  it('erro que não é Error (um texto lançado) também é registrado', async () => {
    await monitor.track(
      'x',
      async () => {
        throw 'falhou feio';
      },
      now,
    );
    expect(error.mock.calls[0]![0]).toMatchObject({
      error: 'falhou feio',
      errorName: 'desconhecido',
    });
  });

  it('falhas seguidas se acumulam, zeram no primeiro sucesso, e guardam a última vez que deu certo', async () => {
    await monitor.track('j', async () => ({ ok: 1 }), now);
    const successAt = new Date(clockMs).toISOString();
    for (let i = 0; i < 2; i++) {
      clockMs += 60_000;
      await monitor.track(
        'j',
        async () => {
          throw new Error('x');
        },
        now,
      );
    }
    expect(monitor.snapshot().jobs[0]).toMatchObject({
      consecutiveFailures: 2,
      lastSuccessAt: successAt,
    });

    clockMs += 60_000;
    await monitor.track('j', async () => ({ ok: 1 }), now);
    expect(monitor.snapshot().jobs[0]).toMatchObject({ consecutiveFailures: 0, lastStatus: 'ok' });
  });

  it('execução pulada (outra instância fazendo o trabalho) não é sucesso nem falha', async () => {
    await monitor.track(
      'j',
      async () => {
        throw new Error('x');
      },
      now,
    );
    await monitor.track('j', async () => null, now);

    const [state] = monitor.snapshot().jobs;
    expect(state).toMatchObject({
      lastStatus: 'skipped',
      consecutiveFailures: 1,
      lastSuccessAt: null,
    });
    expect(error).toHaveBeenCalledTimes(1);
    expect(debug).toHaveBeenCalledWith(expect.objectContaining({ event: 'job_skipped', job: 'j' }));
  });

  it(`com ${DEGRADED_AFTER_FAILURES} falhas seguidas em qualquer job, o estado geral fica degradado`, async () => {
    for (let i = 0; i < DEGRADED_AFTER_FAILURES - 1; i++) {
      await monitor.track(
        'ruim',
        async () => {
          throw new Error('x');
        },
        now,
      );
    }
    await monitor.track('bom', async () => ({ n: 1 }), now);
    expect(monitor.snapshot().status).toBe('ok');

    await monitor.track(
      'ruim',
      async () => {
        throw new Error('x');
      },
      now,
    );
    expect(monitor.snapshot().status).toBe('degraded');

    await monitor.track('ruim', async () => ({ n: 1 }), now);
    expect(monitor.snapshot().status).toBe('ok');
  });

  it('os limites são exatos: 2 falhas seguidas ainda é ok, 3 é degradado (e 3 é o número, não uma conta)', async () => {
    expect(DEGRADED_AFTER_FAILURES).toBe(3);
    const fail = () =>
      monitor.track(
        'j',
        async () => {
          throw new Error('x');
        },
        now,
      );
    await fail();
    await fail();
    expect(monitor.snapshot().status).toBe('ok');
    await fail();
    expect(monitor.snapshot().status).toBe('degraded');
  });

  it('lista os jobs por nome e cada um com o seu estado', async () => {
    await monitor.track('b-job', async () => ({ n: 1 }), now);
    await monitor.track(
      'a-job',
      async () => {
        throw new Error('x');
      },
      now,
    );
    expect(monitor.snapshot().jobs.map((job) => [job.name, job.lastStatus])).toEqual([
      ['a-job', 'failed'],
      ['b-job', 'ok'],
    ]);
  });

  it('sem execuções, o snapshot é ok e vazio', () => {
    expect(monitor.snapshot()).toEqual({ status: 'ok', jobs: [] });
  });
});
