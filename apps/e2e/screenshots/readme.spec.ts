import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import pg from 'pg';
import sharp from 'sharp';
import { levelForXp } from '@lifexp/shared';
import {
  TIMEZONE,
  listActivities,
  registerViaApi,
  today,
  type ApiActivity,
} from '../tests/helpers';

/**
 * Gera as imagens do README. Cria uma pessoa com ~6 meses de histórico (blocos concluídos e XP gravados direto no
 * banco de e2e, com os caches coerentes com o livro-caixa) e o dia de hoje e a semana atual pelo próprio app (API).
 * Os números são de exemplo: nada aqui é de uma pessoa real.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env['README_SHOTS_DIR'] ?? path.resolve(here, '../../../assets/readme');
const PASSWORD = 'senha-demo-12345';
const HISTORY_DAYS = 26 * 7;

/** Gerador pseudoaleatório com semente: as imagens saem iguais a cada execução. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const weekdayOf = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = segunda
/** Hora local de São Paulo (UTC-3, sem horário de verão) como instante UTC. */
const localToUtc = (date: string, time: string) => new Date(`${date}T${time}:00-03:00`);

type Activity = Pick<ApiActivity, 'id' | 'areaId'>;

async function seedHistory(userId: string, activities: Activity[]) {
  const rnd = mulberry32(2026);
  const db = new pg.Client({ connectionString: process.env['E2E_DATABASE_URL'] });
  await db.connect();
  const ledger = new Map<string, number>();
  let total = 0;
  const start = addDays(today(), -HISTORY_DAYS);
  const starts = ['07:00', '09:00', '10:30', '14:00', '16:00', '19:00', '21:00'];
  const durations = [30, 45, 60, 60, 90, 120];

  try {
    // Termina anteontem: o que ficou aberto ontem entraria na tela Hoje como "vindo de ontem" e poluiria a imagem.
    for (let offset = 0; offset < HISTORY_DAYS - 2; offset += 1) {
      const date = addDays(start, offset);
      const weekday = weekdayOf(date);
      const count = weekday < 5 ? 2 + Math.floor(rnd() * 3) : rnd() < 0.35 ? 1 : 0;
      // Ritmo que melhora com o tempo: no começo conclui menos, no fim quase tudo.
      const ramp = 0.35 + 0.55 * (offset / HISTORY_DAYS);

      for (let index = 0; index < count; index += 1) {
        const activity = activities[(offset + index) % activities.length]!;
        const startTime = starts[Math.floor(rnd() * starts.length)]!;
        const durationMin = durations[Math.floor(rnd() * durations.length)]!;
        const blockId = randomUUID();
        await db.query(
          `INSERT INTO "Block" (id,"userId","activityId",recurrence,date,"startTime","durationMin","createdAt","updatedAt")
           VALUES ($1,$2,$3,'ONCE',$4,$5,$6,now(),now())`,
          [blockId, userId, activity.id, date, startTime, durationMin],
        );
        if (rnd() > ramp) continue; // planejado, não concluído (aro vazio no mapa)

        const completedAt = new Date(localToUtc(date, startTime).getTime() + durationMin * 60_000);
        const completionId = randomUUID();
        await db.query(
          `INSERT INTO "Completion" (id,"userId","blockId","occurrenceDate","completedAt","activityId","areaId","durationMin","xpAmount","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$5,$5)`,
          [
            completionId,
            userId,
            blockId,
            date,
            completedAt,
            activity.id,
            activity.areaId,
            durationMin,
            durationMin,
          ],
        );
        await db.query(
          `INSERT INTO "XpTransaction" (id,"userId","areaId",amount,type,"sourceId","createdAt")
           VALUES ($1,$2,$3,$4,'COMPLETION',$5,$6)`,
          [randomUUID(), userId, activity.areaId, durationMin, completionId, completedAt],
        );
        ledger.set(activity.areaId, (ledger.get(activity.areaId) ?? 0) + durationMin);
        total += durationMin;
      }
    }

    // Os caches precisam bater com o livro-caixa (RN29): a tela de níveis e o HUD leem deles.
    await db.query(`UPDATE "User" SET "cachedTotalXp"=$2 WHERE id=$1`, [userId, total]);
    for (const [areaId, xp] of ledger) {
      await db.query(
        `INSERT INTO "AreaProgress" (id,"userId","areaId","cachedXp","cachedLevel","updatedAt")
         VALUES ($1,$2,$3,$4,$5,now())
         ON CONFLICT ("areaId") DO UPDATE SET "cachedXp"=EXCLUDED."cachedXp","cachedLevel"=EXCLUDED."cachedLevel"`,
        [randomUUID(), userId, areaId, xp, levelForXp(xp)],
      );
    }
  } finally {
    await db.end();
  }
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function seedWeek(request: APIRequestContext, token: string, activities: Activity[]) {
  const monday = addDays(today(), -weekdayOf(today()));
  const post = async (path: string, data: object) => {
    const response = await request.post(path, { headers: auth(token), data });
    expect(response.ok(), `${path} ${await response.text()}`).toBe(true);
    return (await response.json()) as { id: string };
  };
  const [a, b, c, d, e] = activities;

  // A semana tipo (repete toda semana, sem fim).
  await post('/api/blocks/weekly', {
    activityId: a!.id,
    weekdays: [1, 3, 5],
    startTime: '09:00',
    durationMin: 90,
    validFrom: monday,
  });
  await post('/api/blocks/weekly', {
    activityId: b!.id,
    weekdays: [2, 4, 6],
    startTime: '07:00',
    durationMin: 60,
    validFrom: monday,
  });
  await post('/api/blocks/weekly', {
    activityId: c!.id,
    weekdays: [1, 2, 3, 4, 5],
    startTime: '14:00',
    durationMin: 120,
    validFrom: monday,
  });
  await post('/api/blocks/weekly', {
    activityId: d!.id,
    weekdays: [1, 2, 3, 4, 5, 7],
    startTime: '21:00',
    durationMin: 30,
    validFrom: monday,
  });

  // Um horário cheio (4 blocos juntos): mostra o "+N" da grade.
  for (const [index, activity] of [a, b, c, e].entries()) {
    await post('/api/blocks', {
      recurrence: 'once',
      activityId: activity!.id,
      date: addDays(monday, 3),
      startTime: '16:00',
      durationMin: 60 - index * 5,
    });
  }

  // Hoje, relativo ao relógio (São Paulo): um concluído, dois abertos e um que ainda vai acontecer. Um bloco só pode ser
  // concluído depois de começar, então o script precisa rodar com o dia já em andamento.
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TIMEZONE,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date()),
  );
  if (hour < 9)
    throw new Error(
      'Rode as capturas depois das 09h (horário de São Paulo): os blocos de hoje já precisam ter começado.',
    );
  const at = (h: number, minutes = '00') => `${String(h).padStart(2, '0')}:${minutes}`;
  const day = today();
  const doneBlock = await post('/api/blocks', {
    recurrence: 'once',
    activityId: b!.id,
    date: day,
    startTime: at(hour - 3),
    durationMin: 45,
  });
  await post('/api/blocks', {
    recurrence: 'once',
    activityId: a!.id,
    date: day,
    startTime: at(hour - 2, '15'),
    durationMin: 60,
  });
  await post('/api/blocks', {
    recurrence: 'once',
    activityId: c!.id,
    date: day,
    startTime: at(hour - 1, '30'),
    durationMin: 30,
  });
  if (hour < 22)
    await post('/api/blocks', {
      recurrence: 'once',
      activityId: d!.id,
      date: day,
      startTime: at(hour + 1),
      durationMin: 30,
    });
  const completed = await request.post(
    `/api/blocks/${doneBlock.id}/occurrences/${day}/completion`,
    { headers: auth(token) },
  );
  expect(completed.ok()).toBe(true);
}

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('textbox', { name: 'Senha' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/');
}

/**
 * Captura a página inteira ajustando a JANELA à altura do conteúdo (e não `fullPage`): a barra lateral e o fundo são fixos
 * na janela e, com `fullPage`, ficariam cortados no meio da imagem.
 */
async function shot(
  page: Page,
  route: string,
  file: string,
  wait: () => Promise<unknown>,
  tall = false,
) {
  await page.goto(route);
  await wait();
  await page.waitForTimeout(700); // animações de entrada
  const original = page.viewportSize()!;
  if (tall) {
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({
      width: original.width,
      height: Math.max(height, original.height),
    });
    await page.waitForTimeout(300);
  }
  // PNG com paleta: a UI escura tem poucas cores e a imagem cai para ~1/4 do tamanho, sem perda visível.
  const png = await page.screenshot();
  await sharp(png).png({ palette: true, quality: 85, effort: 9 }).toFile(path.join(OUT, file));
  if (tall) await page.setViewportSize(original);
}

test('capturas do README', async ({ page, request, browser }) => {
  test.setTimeout(180_000);
  mkdirSync(OUT, { recursive: true });

  const email = `demo-${Date.now()}@exemplo.com`;
  const token = await registerViaApi(request, { name: 'Claudio', email, password: PASSWORD });
  const me = await request.get('/api/users/me', { headers: auth(token) });
  const { id: userId } = (await me.json()) as { id: string };
  const activities = await listActivities(request, token);
  expect(activities.length).toBeGreaterThanOrEqual(5);

  await seedHistory(userId, activities);
  await seedWeek(request, token, activities);

  await login(page, email);
  await shot(
    page,
    '/',
    'painel.png',
    () => expect(page.getByRole('heading', { name: /Olá/ })).toBeVisible(),
    true,
  );
  await shot(page, '/hoje', 'hoje.png', () =>
    expect(page.getByRole('article').first()).toBeVisible(),
  );
  await shot(
    page,
    '/semana',
    'semana.png',
    () => expect(page.getByRole('button', { name: /Mais \d+ blocos?/ })).toBeVisible(),
    true,
  );
  await shot(
    page,
    '/calendario',
    'mes.png',
    () => expect(page.getByTestId('area-strip').first()).toBeVisible(),
    true,
  );
  await shot(
    page,
    '/evolucao',
    'evolucao.png',
    () => expect(page.getByTestId('heat-cell').first()).toBeVisible(),
    true,
  );

  // Celular.
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
    locale: 'pt-BR',
    timezoneId: TIMEZONE,
  });
  const mobile = await phone.newPage();
  await login(mobile, email);
  await shot(mobile, '/hoje', 'celular-hoje.png', () =>
    expect(mobile.getByRole('article').first()).toBeVisible(),
  );
  await shot(mobile, '/semana', 'celular-semana.png', () =>
    expect(mobile.getByRole('tab').first()).toBeVisible(),
  );
  await phone.close();
});
