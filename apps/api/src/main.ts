import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { JsonLogger, resolveLogFormat } from './observability/json-logger.js';
import type { Env } from './config/env.schema.js';
import { setupApp } from './setup-app.js';

// bufferLogs: o que o Nest registra durante a inicialização espera o logger escolhido (JSON ou texto) ficar pronto.
const app = await NestFactory.create(AppModule, { bufferLogs: true });
const config = app.get(ConfigService<Env, true>);
if (
  resolveLogFormat(
    config.get('LOG_FORMAT', { infer: true }),
    config.get('NODE_ENV', { infer: true }),
  ) === 'json'
) {
  app.useLogger(new JsonLogger());
}
setupApp(app);
await app.listen(config.get('PORT'));
