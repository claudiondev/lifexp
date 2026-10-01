import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.schema.js';
import { setupApp } from './setup-app.js';

const app = await NestFactory.create(AppModule);
setupApp(app);
await app.listen(app.get(ConfigService<Env, true>).get('PORT'));
