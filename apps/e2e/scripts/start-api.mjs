// Prepara o banco de teste e sobe a API (já compilada) para os testes e2e do navegador.
// Roda como "webServer" do Playwright: o Playwright espera a API responder e a encerra no fim.
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const databaseUrl =
  process.env.E2E_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/lifexp_e2e';
const url = new URL(databaseUrl);
const databaseName = decodeURIComponent(url.pathname.slice(1));

// Trava de segurança: este script apaga dados. Só opera em banco cujo nome termina em "_e2e".
if (!databaseName.endsWith('_e2e')) {
  throw new Error(`Banco "${databaseName}" não é de e2e (o nome precisa terminar em _e2e)`);
}

const adminUrl = new URL(databaseUrl);
adminUrl.pathname = '/postgres';

const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();
try {
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
  if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${databaseName}"`);
} finally {
  await admin.end();
}

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../api');
const env = { ...process.env, DATABASE_URL: databaseUrl };

execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
  cwd: apiDir,
  env,
  stdio: 'inherit',
});

// Começa sempre do zero: cada execução parte de um banco sem pessoas.
const db = new pg.Client({ connectionString: databaseUrl });
await db.connect();
try {
  await db.query('TRUNCATE TABLE "Session", "User" CASCADE');
} finally {
  await db.end();
}

const api = spawn('node', ['dist/main.js'], { cwd: apiDir, env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => api.kill(signal));
api.on('exit', (code) => process.exit(code ?? 0));
