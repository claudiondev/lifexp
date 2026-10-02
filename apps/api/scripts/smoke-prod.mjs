// Fumaça de produção: confere, contra uma API JÁ no ar em modo produção, o que não pode falhar num deploy:
// saúde e prontidão, Swagger desligado, cabeçalhos de segurança, cookie de sessão Secure/HttpOnly e o fluxo
// cadastro -> sessão -> exclusão. Não mexe em nada além de uma conta descartável, que apaga no fim.
//
//   node scripts/smoke-prod.mjs https://sua-api.up.railway.app      (sem argumento: http://localhost:3000)
//
// Atrás de HTTPS de verdade, o cookie Secure chega ao navegador; contra http://localhost o script só confere o
// atributo no Set-Cookie. Sai com código 1 se algo falhar.
import { randomUUID } from 'node:crypto';

const base = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${name}${!ok && detail ? ` (${detail})` : ''}`);
  if (!ok) failures.push(name);
};

const get = (path, init) => fetch(`${base}${path}`, { redirect: 'manual', ...init });

const health = await get('/api/health');
check(
  'GET /api/health responde 200 com status ok',
  health.status === 200 && (await health.json()).status === 'ok',
);

const ready = await get('/api/health/ready');
check(
  'GET /api/health/ready responde 200 (banco no ar)',
  ready.status === 200,
  `status ${ready.status}`,
);

const jobs = await get('/api/health/jobs');
const jobsBody = jobs.status === 200 ? await jobs.json() : {};
check(
  'GET /api/health/jobs responde com status ok/degraded',
  ['ok', 'degraded'].includes(jobsBody.status),
);
check('/api/health/jobs não vaza texto de erro', !JSON.stringify(jobsBody).includes('error'));

const docs = await get('/api/docs');
check(
  'Swagger (/api/docs) está desligado em produção',
  docs.status === 404,
  `status ${docs.status}`,
);

const headers = health.headers;
check(
  'cabeçalho X-Content-Type-Options: nosniff',
  headers.get('x-content-type-options') === 'nosniff',
);
check('sem X-Powered-By (não entrega o framework)', !headers.get('x-powered-by'));
check('Content-Security-Policy presente', Boolean(headers.get('content-security-policy')));
check(
  'Strict-Transport-Security presente',
  Boolean(headers.get('strict-transport-security')),
  'o helmet envia; se faltar, algo o desligou',
);

const unauth = await get('/api/progress');
check('rota protegida sem token responde 401', unauth.status === 401, `status ${unauth.status}`);

const email = `smoke-${randomUUID()}@exemplo.test`;
const password = `Senha-${randomUUID()}`;
const register = await get('/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Smoke', email, password }),
});
check('cadastro responde 201', register.status === 201, `status ${register.status}`);
const session = register.status === 201 ? await register.json() : null;

const cookie = register.headers.getSetCookie?.().find((line) => line.startsWith('refresh_token='));
check('cookie de sessão é HttpOnly', Boolean(cookie?.includes('HttpOnly')));
check(
  'cookie de sessão é Secure',
  Boolean(cookie?.includes('Secure')),
  'defina COOKIE_SECURE=true',
);
check('cookie de sessão é SameSite', Boolean(cookie && /SameSite=(Strict|Lax)/i.test(cookie)));

if (session) {
  const auth = { Authorization: `Bearer ${session.accessToken}` };
  const progress = await get('/api/progress', { headers: auth });
  check(
    'rota protegida com token responde 200',
    progress.status === 200,
    `status ${progress.status}`,
  );

  const cleanup = await get('/api/users/me/delete', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  check('a conta de teste foi apagada (204)', cleanup.status === 204, `status ${cleanup.status}`);
}

console.log(
  failures.length === 0 ? '\nTudo certo.' : `\n${failures.length} verificação(ões) falharam.`,
);
process.exit(failures.length === 0 ? 0 : 1);
