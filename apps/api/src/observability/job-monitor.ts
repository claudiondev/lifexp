import { Injectable, Logger } from '@nestjs/common';
import { redact, truncate } from './redact.js';

export type JobStatus = 'ok' | 'failed' | 'skipped';

export interface JobState {
  name: string;
  lastRunAt: string;
  lastStatus: JobStatus;
  lastDurationMs: number;
  lastSuccessAt: string | null;
  /** Falhas seguidas (zera na primeira execução bem-sucedida). */
  consecutiveFailures: number;
}

/** Quantas falhas seguidas tornam o estado geral "degradado". */
export const DEGRADED_AFTER_FAILURES = 3;
const MAX_ERROR = 300;

export interface JobsSnapshot {
  status: 'ok' | 'degraded';
  jobs: JobState[];
}

/**
 * Acompanha os jobs agendados (varredura de avisos, quests...) para que uma falha seja IDENTIFICADA (RNF13): cada
 * execução vira um registro estruturado no log (`job_ok`, `job_failed` ou `job_skipped`) e o último estado de cada job
 * fica em memória, para o health mostrar. O erro vai redigido e cortado; nada de dado da pessoa. Um job que falha não
 * derruba o processo: a falha é registrada e a próxima execução tenta de novo.
 */
@Injectable()
export class JobMonitor {
  private readonly logger = new Logger('Jobs');
  private readonly states = new Map<string, JobState>();

  /**
   * Roda o job e registra o resultado. `fn` devolve `null` quando a execução foi pulada (outra instância tinha a
   * trava) e, caso contrário, um resumo simples para o log. Nunca lança.
   */
  async track(
    name: string,
    fn: () => Promise<Record<string, number | string | boolean> | null>,
    now: () => number = Date.now,
  ): Promise<void> {
    const startedAt = now();
    const previous = this.states.get(name);
    try {
      const summary = await fn();
      const durationMs = now() - startedAt;
      if (summary === null) {
        this.record(name, startedAt, durationMs, 'skipped', previous, false);
        this.logger.debug({ event: 'job_skipped', job: name, durationMs });
        return;
      }
      this.record(name, startedAt, durationMs, 'ok', previous, true);
      // Execução que não fez nada não vira ruído: só aparece quando há trabalho (números diferentes de zero).
      const worked = Object.values(summary).some((value) => typeof value === 'number' && value > 0);
      (worked ? this.logger.log : this.logger.debug).call(this.logger, {
        event: 'job_ok',
        job: name,
        durationMs,
        ...summary,
      });
    } catch (error) {
      const durationMs = now() - startedAt;
      const state = this.record(name, startedAt, durationMs, 'failed', previous, false);
      this.logger.error({
        event: 'job_failed',
        job: name,
        durationMs,
        consecutiveFailures: state.consecutiveFailures,
        error: truncate(redact(error instanceof Error ? error.message : String(error)), MAX_ERROR),
        errorName: error instanceof Error ? error.name : 'desconhecido',
      });
    }
  }

  private record(
    name: string,
    startedAt: number,
    durationMs: number,
    status: JobStatus,
    previous: JobState | undefined,
    success: boolean,
  ): JobState {
    const at = new Date(startedAt).toISOString();
    const state: JobState = {
      name,
      lastRunAt: at,
      lastStatus: status,
      lastDurationMs: durationMs,
      lastSuccessAt: success ? at : (previous?.lastSuccessAt ?? null),
      // Pular não é falha nem sucesso: mantém a contagem.
      consecutiveFailures:
        status === 'failed'
          ? (previous?.consecutiveFailures ?? 0) + 1
          : status === 'ok'
            ? 0
            : (previous?.consecutiveFailures ?? 0),
    };
    this.states.set(name, state);
    return state;
  }

  snapshot(): JobsSnapshot {
    const jobs = [...this.states.values()].sort((a, b) => a.name.localeCompare(b.name));
    const degraded = jobs.some((job) => job.consecutiveFailures >= DEGRADED_AFTER_FAILURES);
    return { status: degraded ? 'degraded' : 'ok', jobs };
  }
}
