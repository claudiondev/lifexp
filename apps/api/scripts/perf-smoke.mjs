// Fumaça de desempenho (RNF04: respostas abaixo de 300 ms nas telas principais), com um volume realista:
// cria uma conta descartável com ~1 ano de séries semanais e centenas de conclusões, mede as rotas que as telas
// usam e apaga a conta no fim. Uso (com a API no ar e o Postgres do .env):
//
//   pnpm --filter @lifexp/api dev            # em outro terminal
//   pnpm --filter @lifexp/api perf:smoke     # opcional: URL da API e número de repetições
//
// Sai com código 1 se alguma rota passar do limite no p95.
import pg from 'pg';
import { randomUUID } from 'node:crypto';

const base = process.argv[2] ?? 'http://localhost:3000';
const runs = Number(process.argv[3] ?? 20);
const LIMIT_MS = 300;
const SERIES = 8; // séries semanais, uma por dia/área
const DAYS_BACK = 400;

const api = async (method, path, token, body) => {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && res.status !== 204)
    throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
};

const iso = (date) => date.toISOString().slice(0, 10);
const addDays = (date, n) => new Date(date.getTime() + n * 86_400_000);

const email = `perf-${randomUUID()}@exemplo.test`;
const password = `Senha-${randomUUID()}`;
const session = await api('POST', '/auth/register', null, { name: 'Perf', email, password });
const token = session.accessToken;
const userId = session.user.id;

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

try {
  const activities = await api('GET', '/activities', token);
  const start = iso(addDays(new Date(), -DAYS_BACK));

  // Séries semanais em dias e áreas diferentes, com um ano de passado.
  const blocks = [];
  for (let i = 0; i < SERIES; i++) {
    const activity = activities[i % activities.length];
    const block = await api('POST', '/blocks', token, {
      recurrence: 'weekly',
      activityId: activity.id,
      weekday: (i % 7) + 1,
      startTime: `${String(6 + i).padStart(2, '0')}:00`,
      durationMin: 60,
      validFrom: start,
    });
    blocks.push({ id: block.id, weekday: (i % 7) + 1, activity });
  }

  // ~70% das ocorrências passadas cumpridas (insere direto: a API só deixa concluir dentro da janela de 1 dia).
  let completions = 0;
  const today = new Date();
  for (let offset = DAYS_BACK; offset > 2; offset--) {
    const day = addDays(today, -offset);
    const weekday = day.getUTCDay() === 0 ? 7 : day.getUTCDay();
    for (const block of blocks.filter((b) => b.weekday === weekday)) {
      if (Math.random() > 0.7) continue;
      await db.query(
        `INSERT INTO "Completion" ("id","userId","blockId","occurrenceDate","completedAt","activityId","areaId","durationMin","xpAmount","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,60,60,now(),now())`,
        [
          randomUUID(),
          userId,
          block.id,
          iso(day),
          day.toISOString(),
          block.activity.id,
          block.activity.areaId,
        ],
      );
      completions += 1;
    }
  }
  console.log(
    `Conta de teste: ${SERIES} séries semanais e ${completions} conclusões em ~${DAYS_BACK} dias.\n`,
  );

  const week = iso(addDays(today, -((today.getUTCDay() + 6) % 7)));
  const routes = [
    ['GET', '/today'],
    ['GET', '/progress'],
    ['GET', `/blocks/week?weekStart=${week}`],
    ['GET', '/quest'],
    ['GET', '/balance'],
    ['GET', '/achievements'],
    ['GET', '/xp/history?limit=20'],
    ['GET', '/notifications/unread-count'],
    ['GET', `/reports/weekly?weekStart=${week}`],
    ['GET', `/reviews/${week}`],
  ];

  let slow = 0;
  const pad = (text, n) => String(text).padEnd(n);
  console.log(`${pad('rota', 48)}${pad('p50', 8)}${pad('p95', 8)}máx (ms)`);
  for (const [method, path] of routes) {
    const times = [];
    for (let i = 0; i < runs; i++) {
      const t0 = performance.now();
      await api(method, path, token);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const at = (q) => times[Math.min(times.length - 1, Math.floor(q * times.length))];
    const p95 = at(0.95);
    if (p95 > LIMIT_MS) slow += 1;
    console.log(
      `${pad(`${method} ${path}`, 48)}${pad(at(0.5).toFixed(0), 8)}${pad(p95.toFixed(0), 8)}${times.at(-1).toFixed(0)}${p95 > LIMIT_MS ? '   <-- acima do limite' : ''}`,
    );
  }
  console.log(`\n${slow === 0 ? 'OK' : `${slow} rota(s) acima`}: limite de ${LIMIT_MS} ms no p95.`);
  process.exitCode = slow === 0 ? 0 : 1;
} finally {
  // Remove a conta de teste pela própria API (a exclusão leva tudo junto).
  try {
    await api('POST', '/users/me/delete', token, { password });
  } catch (error) {
    console.error('Não consegui apagar a conta de teste:', error.message);
  }
  await db.end();
}
