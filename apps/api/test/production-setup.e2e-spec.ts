import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

/**
 * Sobe a aplicação com variáveis de ambiente específicas e restaura tudo no fim. O `ConfigModule` lê o ambiente quando o
 * módulo é importado, então os módulos são recarregados (`vi.resetModules`) depois de definir as variáveis.
 */
async function withEnv<T>(
  vars: Record<string, string>,
  run: (app: INestApplication, helpers: typeof import('./helpers.js')) => Promise<T>,
) {
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  vi.resetModules();
  const helpers = await import('./helpers.js');
  const app = await helpers.createTestApp();
  try {
    return await run(app, helpers);
  } finally {
    await app.close();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.resetModules();
  }
}

describe('Configuração de produção (e2e)', () => {
  describe('Swagger', () => {
    it('desligado por configuração: /api/docs não existe (404), mas a API segue de pé', async () => {
      await withEnv({ SWAGGER_ENABLED: 'false' }, async (app) => {
        await request(app.getHttpServer()).get('/api/docs').expect(404);
        await request(app.getHttpServer()).get('/api/health').expect(200);
      });
    });

    it('ligado, o /api/docs responde', async () => {
      await withEnv({ SWAGGER_ENABLED: 'true' }, async (app) => {
        await request(app.getHttpServer()).get('/api/docs').expect(200);
      });
    });
  });

  describe('IP do cliente atrás de proxy (TRUST_PROXY)', () => {
    // O limite de tentativas é por IP (RS08). Sem confiar em proxy, o IP é o da conexão e X-Forwarded-For é ignorado;
    // confiando em N proxies, vale o endereço de N saltos atrás, nunca o que o cliente escreveu à esquerda.
    const attempts = async (
      app: INestApplication,
      forwarded: (i: number) => string,
      count: number,
    ) => {
      const statuses: number[] = [];
      for (let i = 0; i < count; i++) {
        const res = await request(app.getHttpServer())
          .post('/api/auth/login')
          .set('X-Forwarded-For', forwarded(i))
          .send({ email: 'ninguem@exemplo.test', password: 'senha-errada-123' });
        statuses.push(res.status);
      }
      return statuses;
    };

    it('sem confiar em proxy, mudar o X-Forwarded-For NÃO escapa do limite', async () => {
      await withEnv({ TRUST_PROXY: 'false', AUTH_RATE_LIMIT_PER_MINUTE: '3' }, async (app) => {
        const statuses = await attempts(app, (i) => `203.0.113.${i + 1}`, 6);
        expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(1);
      });
    });

    it('confiando em 1 proxy, o IP que vale é o último do cabeçalho: o resto escrito pelo cliente não ajuda', async () => {
      await withEnv({ TRUST_PROXY: '1', AUTH_RATE_LIMIT_PER_MINUTE: '3' }, async (app) => {
        // o cliente varia o início ("fingindo" ser outros IPs), mas o proxy confiável sempre acrescenta o IP real
        const statuses = await attempts(app, (i) => `198.51.100.${i + 1}, 203.0.113.9`, 6);
        expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(1);
      });
    });

    it('confiando em 2 proxies (Vercel -> Railway), o IP que vale é o PENÚLTIMO do cabeçalho', async () => {
      await withEnv({ TRUST_PROXY: '2', AUTH_RATE_LIMIT_PER_MINUTE: '3' }, async (app) => {
        // o último endereço é o do primeiro proxy (igual para todos); o cliente real vem logo antes e varia
        const statuses = await attempts(app, (i) => `203.0.113.${i + 1}, 198.51.100.9`, 6);
        expect(statuses.filter((s) => s === 429)).toHaveLength(0);
      });
    });

    it('confiando em 1 proxy, clientes de IPs diferentes (o último endereço) não dividem o mesmo limite', async () => {
      await withEnv({ TRUST_PROXY: '1', AUTH_RATE_LIMIT_PER_MINUTE: '3' }, async (app) => {
        const statuses = await attempts(app, (i) => `203.0.113.${i + 1}`, 6);
        expect(statuses.filter((s) => s === 429)).toHaveLength(0);
      });
    });
  });

  it('o cadastro continua funcionando com a configuração de produção segura', async () => {
    await withEnv({ COOKIE_SECURE: 'true', TRUST_PROXY: '2' }, async (app, { registerUser }) => {
      const user = await registerUser(app);
      expect(user.accessToken).toBeTruthy();
    });
  });
});
