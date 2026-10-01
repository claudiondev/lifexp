import { z } from 'zod';

/** Query string só carrega texto: "true"/"false" vira booleano de verdade, padrão false. */
export const queryBooleanSchema = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');
