import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'error']),
  timestamp: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
