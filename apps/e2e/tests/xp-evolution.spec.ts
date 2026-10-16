import { expect, test } from '@playwright/test';
import {
  completeOccurrence,
  listActivities,
  loginViaUi,
  newUser,
  registerViaApi,
  today,
} from './helpers';

test('evolução do XP: o XP ganho hoje aparece na semana atual, no gráfico e no resumo', async ({
  page,
  request,
}) => {
  const user = newUser('evolucao');
  const token = await registerViaApi(request, user);
  const [study, health] = await listActivities(request, token);

  // 60 min às 00:00 de hoje (já liberado para concluir) = +60 XP em cada área.
  for (const activity of [study!, health!]) {
    await completeOccurrence(request, token, {
      activityId: activity.id,
      date: today(),
      startTime: '00:00',
      durationMin: 60,
    });
  }

  await loginViaUi(page, user);
  await page.goto('/evolucao');

  await expect(page.getByRole('heading', { name: 'Evolução do XP' })).toBeVisible();
  // 8 semanas por padrão; a atual é a última e leva o XP das duas áreas (120).
  await expect(page.getByTestId('xp-bar')).toHaveCount(8);
  await expect(page.getByText(/Semana de \d\d\/\d\d \(atual\): 120 XP/)).toBeAttached();

  const summary = page.getByRole('region', { name: 'Esta semana' });
  await expect(summary.getByText('120 XP', { exact: true })).toBeVisible();
  const byArea = page.getByRole('region', { name: 'Por área nesta semana' });
  await expect(byArea.getByText('60 XP')).toHaveCount(2);

  // Trocar o período muda o número de colunas.
  await page.getByRole('button', { name: '12 semanas' }).click();
  await expect(page.getByTestId('xp-bar')).toHaveCount(12);
});

test('evolução do XP: conta nova convida a concluir um bloco', async ({ page, request }) => {
  const user = newUser('evolucao-vazia');
  await registerViaApi(request, user);
  await loginViaUi(page, user);
  await page.goto('/evolucao');
  await expect(page.getByText(/Nenhum XP neste período ainda/)).toBeVisible();
});
