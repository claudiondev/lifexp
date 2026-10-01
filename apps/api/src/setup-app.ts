import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

/** Configuração compartilhada entre main.ts e os testes e2e. */
export function setupApp(app: INestApplication): void {
  app.setGlobalPrefix('api');

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('LifeXP API').setVersion('0.0.0').build(),
  );
  // O path do Swagger não recebe o prefixo global, por isso já inclui "api/".
  SwaggerModule.setup('api/docs', app, cleanupOpenApiDoc(document));
}
