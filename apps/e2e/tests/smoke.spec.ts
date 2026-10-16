import { expect, test } from '@playwright/test';

test('a página de entrada carrega e leva ao cadastro', async ({ page }) => {
  await page.goto('/login');
  await expect(page).toHaveTitle(/LifeXP/);
  await page.getByRole('link', { name: 'Crie seu personagem' }).click();
  await expect(page.getByRole('button', { name: 'Criar conta' })).toBeVisible();
});
