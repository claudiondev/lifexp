import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'error']),
  timestamp: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

/**
 * Estado dos jobs agendados (RNF13): a varredura de avisos, as quests... `degraded` quando algum falhou várias vezes
 * seguidas. Só nomes, instantes e contagens: nada de erro, mensagem ou dado de pessoa.
 */
export const jobStateSchema = z.object({
  name: z.string(),
  lastRunAt: z.iso.datetime(),
  lastStatus: z.enum(['ok', 'failed', 'skipped']),
  lastDurationMs: z.number().int().min(0),
  lastSuccessAt: z.iso.datetime().nullable(),
  consecutiveFailures: z.number().int().min(0),
});

export const jobsHealthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  jobs: z.array(jobStateSchema),
});

export type JobState = z.infer<typeof jobStateSchema>;
export type JobsHealth = z.infer<typeof jobsHealthSchema>;
