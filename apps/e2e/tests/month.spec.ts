import { expect, test } from '@playwright/test';
import {
  completeOccurrence,
  createOnceBlock,
  listActivities,
  loginViaUi,
  newUser,
  registerViaApi,
  today,
} from './helpers';

test('mês: os blocos aparecem no dia com resumo, e o dia aberto lista e leva à Semana', async ({
  page,
  request,
}) => {
  const user = newUser('mes');
  const token = await registerViaApi(request, user);
  const [study, health] = await listActivities(request, token);

  // Dois blocos hoje: um concluído (00:00) e um que ainda vai acontecer (23:00).
  await completeOccurrence(request, token, {
    activityId: study!.id,
    date: today(),
    startTime: '00:00',
    durationMin: 60,
  });
  await createOnceBlock(request, token, {
    activityId: health!.id,
    date: today(),
    startTime: '23:00',
    durationMin: 30,
  });

  await loginViaUi(page, user);
  await page.goto('/calendario');

  const grid = page.getByRole('region', { name: 'Grade do mês' });
  // O resumo do dia: 1 de 2 blocos concluídos, 1 h 30 min planejados.
  await expect(grid.getByText('1/2 · 1 h 30 min')).toBeVisible();
  await expect(grid.getByTestId('area-strip')).toHaveCount(1);
  await expect(grid.getByRole('button', { name: /\(hoje\).*, 2 blocos$/ })).toBeVisible();

  // O dia aberto (hoje) lista os dois blocos em ordem de horário, o concluído com o XP.
  const list = page.getByRole('region', { name: 'Blocos do dia' });
  const links = list.getByRole('link');
  await expect(links).toHaveCount(2);
  await expect(links.first()).toContainText('+60 XP');
  await expect(links.last()).not.toContainText('XP');

  // Clicar leva à Semana em que o bloco está.
  await links.first().click();
  await expect(page).toHaveURL(/\/semana\?inicio=\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByRole('heading', { name: 'Sua semana' })).toBeVisible();
});

test('mês: conta sem blocos mostra o mês só com eventos e avisa que o dia está livre', async ({
  page,
  request,
}) => {
  const user = newUser('mes-vazio');
  await registerViaApi(request, user);
  await loginViaUi(page, user);
  await page.goto('/calendario');

  await expect(
    page.getByRole('region', { name: 'Grade do mês' }).getByTestId('area-strip'),
  ).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'Blocos do dia' }).getByText('Nenhum bloco neste dia.'),
  ).toBeVisible();
});
