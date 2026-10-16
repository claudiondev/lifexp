import { expect, test } from '@playwright/test';
import {
  createOnceBlock,
  listActivities,
  loginViaUi,
  newUser,
  registerViaApi,
  today,
} from './helpers';

test('semana: horário lotado vira "+N" com a lista, e a densidade muda a altura', async ({
  page,
  request,
}) => {
  const user = newUser('calendario');
  const token = await registerViaApi(request, user);
  const activities = await listActivities(request, token);
  expect(activities.length).toBeGreaterThanOrEqual(4);

  // 4 blocos no mesmo horário: a grade mostra 2 e esconde 2 atrás de um "+2".
  for (const activity of activities.slice(0, 4)) {
    await createOnceBlock(request, token, {
      activityId: activity.id,
      date: today(),
      startTime: '09:00',
      durationMin: 60,
    });
  }

  await loginViaUi(page, user);
  await page.goto('/semana');

  const more = page.getByRole('button', { name: /Mais 2 blocos/ });
  await expect(more).toBeVisible();
  await expect(more).toHaveText('+2');

  // Nenhum bloco some: o que não coube na grade está na lista do "+2".
  await more.click();
  const list = page.getByRole('dialog', { name: 'Mais blocos neste horário' });
  await expect(list.getByRole('button')).toHaveCount(3); // 2 blocos + o botão de fechar
  await page.keyboard.press('Escape');
  await expect(list).toBeHidden();

  // Densidade: "Confortável" deixa o mesmo bloco mais alto, e a escolha sobrevive ao recarregar.
  const card = page.getByRole('button', { name: new RegExp(activities[0]!.name) }).first();
  const normal = (await card.boundingBox())!.height;
  await page.getByRole('button', { name: 'Confortável' }).click();
  await expect(page.getByRole('button', { name: 'Confortável' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const comfortable = (await card.boundingBox())!.height;
  expect(comfortable).toBeGreaterThan(normal);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Confortável' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('semana: o resumo do dia mostra os blocos e o tempo planejado', async ({ page, request }) => {
  const user = newUser('resumo');
  const token = await registerViaApi(request, user);
  const [activity] = await listActivities(request, token);

  await createOnceBlock(request, token, {
    activityId: activity!.id,
    date: today(),
    startTime: '10:00',
    durationMin: 90,
  });

  await loginViaUi(page, user);
  await page.goto('/semana');
  await expect(page.getByText('0/1 · 1 h 30 min')).toBeVisible();
});
