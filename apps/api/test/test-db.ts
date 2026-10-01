import 'dotenv/config';

/**
 * Banco de teste = banco configurado + sufixo "_test", no mesmo servidor.
 * Em dev: lifexp -> lifexp_test. No CI: o mesmo, num Postgres descartável.
 */
export function resolveTestDatabase(): { adminUrl: string; testUrl: string; testName: string } {
  const baseUrl = process.env['DATABASE_URL'];
  if (!baseUrl) {
    throw new Error('DATABASE_URL é necessária para os testes e2e (veja apps/api/.env.example).');
  }
  const url = new URL(baseUrl);
  const baseName = url.pathname.replace(/^\//, '');
  const testName = baseName.endsWith('_test') ? baseName : `${baseName}_test`;

  const testUrl = new URL(baseUrl);
  testUrl.pathname = `/${testName}`;
  return { adminUrl: baseUrl, testUrl: testUrl.toString(), testName };
}
