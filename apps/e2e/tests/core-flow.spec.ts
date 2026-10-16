import { expect, test } from '@playwright/test';
import { newUser, registerViaApi, registerViaUi, today } from './helpers';

test('cadastro, planejar um bloco, concluir e ver o XP ganho', async ({ page }) => {
  const user = newUser('fluxo');
  await registerViaUi(page, user);

  // Planeja um bloco avulso para hoje, começando à meia-noite (já liberado para concluir).
  await page.goto('/semana');
  await page.getByRole('button', { name: 'Novo bloco' }).click();
  const dialog = page.getByRole('dialog', { name: 'Novo bloco' });
  await dialog.getByLabel('Atividade').selectOption({ index: 1 });
  await dialog.getByText('Só uma vez').click();
  await dialog.getByLabel('Data').fill(today());
  await dialog.getByLabel('Início').fill('00:00');
  await dialog.getByRole('button', { name: 'Criar bloco' }).click();
  await expect(dialog).toBeHidden();

  // Em Hoje o bloco aparece aberto, com a prévia do XP no botão; concluir rende exatamente esse XP.
  await page.goto('/hoje');
  const card = page.getByRole('article').first();
  const complete = card.getByRole('button', { name: /Concluir/ });
  await expect(complete).toBeVisible();
  const xp = Number(/\+(\d+) XP/.exec((await complete.textContent()) ?? '')?.[1]);
  expect(xp).toBeGreaterThan(0);
  await complete.click();
  await expect(card.getByRole('button', { name: 'Desfazer' })).toBeVisible();
  await expect(card.getByText(`+${xp} XP`)).toBeVisible();

  // O ganho fica registrado no histórico de XP, com o mesmo valor.
  await page.goto('/historico');
  await expect(page.getByText(`+${xp}`, { exact: false }).first()).toBeVisible();
});

test('quem não entrou é levado ao login e, depois de entrar, volta para onde queria', async ({
  page,
  request,
}) => {
  const user = newUser('retorno');
  await registerViaApi(request, user);

  await page.goto('/semana');
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel('E-mail').fill(user.email);
  await page.getByRole('textbox', { name: 'Senha' }).fill(user.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/semana');
});
