import { execSync } from 'node:child_process';
import pg from 'pg';
import { resolveTestDatabase } from './test-db.js';

/** Roda uma vez antes da suíte e2e: garante o banco de teste, aplica migrations e zera os dados. */
export default async function setup(): Promise<void> {
  const { adminUrl, testUrl, testName } = resolveTestDatabase();

  // Trava de segurança: nunca operar em um banco que não seja de teste.
  if (!testName.endsWith('_test')) throw new Error(`Banco "${testName}" não é de teste`);

  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [testName]);
    if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${testName}"`);
  } finally {
    await admin.end();
  }

  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testUrl },
  });

  const db = new pg.Client({ connectionString: testUrl });
  await db.connect();
  try {
    await db.query('TRUNCATE TABLE "Session", "User" CASCADE');
  } finally {
    await db.end();
  }
}
