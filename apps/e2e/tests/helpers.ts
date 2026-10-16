import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** Mesmo fuso que o `playwright.config.ts` fixa no navegador: é nele que a API decide "hoje". */
export const TIMEZONE = 'America/Sao_Paulo';

export interface TestUser {
  name: string;
  email: string;
  password: string;
}

/** Pessoa nova a cada chamada: os testes rodam em paralelo no mesmo banco sem dividir dados. */
export function newUser(label: string): TestUser {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    name: `Teste ${label}`,
    email: `e2e-${label}-${unique}@exemplo.com`,
    password: 'senha-e2e-12345',
  };
}

/** "AAAA-MM-DD" de hoje no fuso da pessoa (e não no do computador que roda o teste). */
export function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());
}

/** Cadastro pelo formulário, como a pessoa faria. Termina já dentro do app. */
export async function registerViaUi(page: Page, user: TestUser): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('Nome').fill(user.name);
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByRole('textbox', { name: 'Senha' }).fill(user.password);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL('/');
}

/** Login pelo formulário. */
export async function loginViaUi(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByRole('textbox', { name: 'Senha' }).fill(user.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/');
}

/** Cadastro direto pela API (atalho para montar o cenário). Devolve o token de acesso. */
export async function registerViaApi(request: APIRequestContext, user: TestUser): Promise<string> {
  const response = await request.post('/api/auth/register', {
    data: { ...user, timezone: TIMEZONE },
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { accessToken: string };
  return body.accessToken;
}

export interface ApiActivity {
  id: string;
  areaId: string;
  name: string;
}

export async function listActivities(
  request: APIRequestContext,
  token: string,
): Promise<ApiActivity[]> {
  const response = await request.get('/api/activities', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as ApiActivity[];
}

/** Cria um bloco avulso (sem repetição) pela API. */
export async function createOnceBlock(
  request: APIRequestContext,
  token: string,
  block: { activityId: string; date: string; startTime: string; durationMin: number },
): Promise<void> {
  const response = await request.post('/api/blocks', {
    headers: { Authorization: `Bearer ${token}` },
    data: { recurrence: 'once', ...block },
  });
  expect(response.status()).toBe(201);
}

/** Conclui pela API a ocorrência de um bloco avulso (o XP cai no livro-caixa como se fosse pelo app). */
export async function completeOccurrence(
  request: APIRequestContext,
  token: string,
  block: { activityId: string; date: string; startTime: string; durationMin: number },
): Promise<void> {
  const created = await request.post('/api/blocks', {
    headers: { Authorization: `Bearer ${token}` },
    data: { recurrence: 'once', ...block },
  });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };
  const done = await request.post(`/api/blocks/${id}/occurrences/${block.date}/completion`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(done.ok()).toBe(true);
}
