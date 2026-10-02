import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import type { Env } from './config/env.schema.js';

const DOCS_PATH = '/api/docs';

/**
 * Helmet padrão em tudo (RS09). O Swagger UI usa scripts/estilos inline, então só /api/docs
 * recebe uma CSP mais frouxa. Não habilitamos CORS: front e API ficam na mesma origem.
 */
function securityHeaders() {
  const strict = helmet();
  const docs = helmet({ contentSecurityPolicy: false });
  return (req: Request, res: Response, next: NextFunction) =>
    (req.path.startsWith(DOCS_PATH) ? docs : strict)(req, res, next);
}

/** Configuração compartilhada entre main.ts e os testes e2e. */
export function setupApp(app: INestApplication): void {
  const config = app.get(ConfigService<Env, true>);

  // Quantos proxies confiáveis ficam à frente da API (0 = nenhum): ver TRUST_PROXY em env.schema.ts.
  const proxies = config.get('TRUST_PROXY');
  if (proxies > 0) app.getHttpAdapter().getInstance().set('trust proxy', proxies);

  app.setGlobalPrefix('api');
  app.use(securityHeaders());
  app.use(cookieParser());

  if (config.get('SWAGGER_ENABLED')) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('LifeXP API').setVersion('0.0.0').addBearerAuth().build(),
    );
    // O path do Swagger não recebe o prefixo global, por isso já inclui "api/".
    SwaggerModule.setup('api/docs', app, cleanupOpenApiDoc(document));
  }
}
