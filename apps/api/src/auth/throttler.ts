import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Env } from '../config/env.schema.js';

/**
 * Limite por IP (RS08), compartilhado por quem usa `@UseGuards(ThrottlerGuard)`: login, cadastro,
 * recuperação de senha e as rotas de exportar e excluir a conta. Só é aplicado onde o guard é posto.
 */
export const authThrottler = ThrottlerModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) => [
    { ttl: 60_000, limit: config.get('AUTH_RATE_LIMIT_PER_MINUTE') },
  ],
});
