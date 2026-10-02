import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Reward } from '@lifexp/shared';
import { setAccessToken } from '@/lib/apiClient';
import { RewardsPage } from './RewardsPage';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast, Toaster: () => null }));

const reward = (n: number, over: Partial<Reward> = {}): Reward => ({
  id: `0192f1a0-7b3c-7000-8000-00000000000${n}`,
  title: `Prêmio ${n}`,
  description: null,
  trigger: { type: 'level', threshold: 5 },
  status: 'locked',
  reachedAt: null,
  redeemedAt: null,
  createdAt: '2026-10-07T12:00:00.000Z',
  ...over,
});

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup(initial: Reward[], overrides: Record<string, () => Response> = {}) {
  let rewards = [...initial];
  const calls: { method: string; url: string; body?: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url, body });
      const override = overrides[`${method} ${url}`];
      if (override) return override();

      if (url === '/api/rewards' && method === 'GET') return json(200, rewards);
      if (url === '/api/rewards' && method === 'POST') {
        const created = reward(rewards.length + 5, { title: body!['title'] as string });
        created.trigger = body!['trigger'] as Reward['trigger'];
        rewards = [created, ...rewards];
        return json(201, created);
      }
      const redeem = url.match(/\/api\/rewards\/([^/]+)\/redeem$/);
      if (redeem && method === 'POST') {
        rewards = rewards.map((r) =>
          r.id === redeem[1]
            ? { ...r, status: 'redeemed', redeemedAt: '2026-10-08T12:00:00.000Z' }
            : r,
        );
        return json(
          200,
          rewards.find((r) => r.id === redeem[1]),
        );
      }
      const one = url.match(/\/api\/rewards\/([^/]+)$/);
      if (one && method === 'PATCH') {
        rewards = rewards.map((r) => (r.id === one[1] ? { ...r, ...body } : r));
        return json(
          200,
          rewards.find((r) => r.id === one[1]),
        );
      }
      if (one && method === 'DELETE') {
        rewards = rewards.filter((r) => r.id !== one[1]);
        return new Response(null, { status: 204 });
      }
      return json(404);
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RewardsPage />
    </QueryClientProvider>,
  );
  return { calls };
}

describe('RewardsPage', () => {
  beforeEach(() => {
    setAccessToken('token');
    toast.success.mockClear();
    toast.error.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sem recompensas, convida a criar a primeira', async () => {
    setup([]);
    expect(await screen.findByText(/Nenhuma recompensa ainda/)).toBeVisible();
  });

  it('agrupa por situação: prontas, em andamento e resgatadas', async () => {
    setup([
      reward(1, { status: 'locked' }),
      reward(2, { status: 'available', reachedAt: '2026-10-07T12:00:00.000Z' }),
      reward(3, { status: 'redeemed', redeemedAt: '2026-10-08T12:00:00.000Z' }),
    ]);

    const ready = await screen.findByRole('region', { name: 'Prontas para resgatar' });
    expect(within(ready).getByText('Prêmio 2')).toBeVisible();
    expect(within(ready).getByRole('button', { name: 'Resgatar' })).toBeVisible();
    const pending = screen.getByRole('region', { name: 'Em andamento' });
    expect(within(pending).getByText('Prêmio 1')).toBeVisible();
    expect(within(pending).getByText('Ao chegar ao nível 5')).toBeVisible();
    expect(within(pending).queryByRole('button', { name: 'Resgatar' })).not.toBeInTheDocument();
    const done = screen.getByRole('region', { name: 'Já resgatadas' });
    expect(within(done).getByText(/Resgatada em/)).toBeVisible();
    expect(within(done).queryByRole('button', { name: 'Resgatar' })).not.toBeInTheDocument();
  });

  it('resgata e avisa', async () => {
    const { calls } = setup([
      reward(2, { status: 'available', reachedAt: '2026-10-07T12:00:00.000Z' }),
    ]);

    await userEvent.click(await screen.findByRole('button', { name: 'Resgatar' }));

    await waitFor(() =>
      expect(calls).toContainEqual(
        expect.objectContaining({
          method: 'POST',
          url: '/api/rewards/0192f1a0-7b3c-7000-8000-000000000002/redeem',
        }),
      ),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('“Prêmio 2” resgatada', {
        description: 'Aproveite, você merece!',
      }),
    );
    expect(await screen.findByRole('region', { name: 'Já resgatadas' })).toBeVisible();
  });

  it('mostra o erro do servidor ao resgatar', async () => {
    setup([reward(2, { status: 'available', reachedAt: '2026-10-07T12:00:00.000Z' })], {
      'POST /api/rewards/0192f1a0-7b3c-7000-8000-000000000002/redeem': () =>
        json(409, { message: 'Esta recompensa ainda não foi desbloqueada' }),
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Resgatar' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Esta recompensa ainda não foi desbloqueada'),
    );
  });

  describe('criar', () => {
    it('cria com gatilho de nível (padrão 5) e manda o corpo no contrato', async () => {
      const { calls } = setup([]);
      await userEvent.click(await screen.findByRole('button', { name: /Nova recompensa/ }));
      const dialog = within(await screen.findByRole('dialog'));

      await userEvent.type(dialog.getByLabelText('Nome'), 'Jantar fora');
      await userEvent.click(dialog.getByRole('button', { name: 'Criar recompensa' }));

      await waitFor(() =>
        expect(calls).toContainEqual({
          method: 'POST',
          url: '/api/rewards',
          body: {
            title: 'Jantar fora',
            description: null,
            trigger: { type: 'level', threshold: 5 },
          },
        }),
      );
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith('Recompensa “Jantar fora” criada'),
      );
      expect(await screen.findByText('Jantar fora')).toBeVisible();
    });

    it('troca o tipo de gatilho e ajusta o campo (streak, XP, conquista)', async () => {
      const { calls } = setup([]);
      await userEvent.click(await screen.findByRole('button', { name: /Nova recompensa/ }));
      const dialog = within(await screen.findByRole('dialog'));
      const type = dialog.getByRole('combobox', { name: 'Tipo de gatilho' });

      await userEvent.selectOptions(type, 'streak');
      expect(dialog.getByLabelText('Dias')).toHaveValue(7);
      await userEvent.selectOptions(type, 'total_xp');
      expect(dialog.getByLabelText('XP')).toHaveValue(1000);

      await userEvent.selectOptions(type, 'achievement');
      expect(dialog.queryByLabelText('XP')).not.toBeInTheDocument();
      await userEvent.selectOptions(
        dialog.getByRole('combobox', { name: 'Conquista' }),
        'unshakeable',
      );
      await userEvent.type(dialog.getByLabelText('Nome'), 'Viagem');
      await userEvent.click(dialog.getByRole('button', { name: 'Criar recompensa' }));

      await waitFor(() =>
        expect(calls).toContainEqual(
          expect.objectContaining({
            method: 'POST',
            body: {
              title: 'Viagem',
              description: null,
              trigger: { type: 'achievement', achievementKey: 'unshakeable' },
            },
          }),
        ),
      );
    });

    it('não envia sem nome nem com limiar fora da faixa', async () => {
      const { calls } = setup([]);
      await userEvent.click(await screen.findByRole('button', { name: /Nova recompensa/ }));
      const dialog = within(await screen.findByRole('dialog'));

      await userEvent.click(dialog.getByRole('button', { name: 'Criar recompensa' }));
      expect(await dialog.findByText('Informe o nome da recompensa')).toBeVisible();

      await userEvent.type(dialog.getByLabelText('Nome'), 'Algo');
      const threshold = dialog.getByLabelText('Nível');
      await userEvent.clear(threshold);
      await userEvent.type(threshold, '1');
      await userEvent.click(dialog.getByRole('button', { name: 'Criar recompensa' }));
      expect(await dialog.findByText('Informe um número inteiro dentro do limite')).toBeVisible();
      expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    });

    it('mostra o erro do servidor no formulário (limite de 50)', async () => {
      setup([], {
        'POST /api/rewards': () => json(409, { message: 'Você já tem 50 recompensas' }),
      });
      await userEvent.click(await screen.findByRole('button', { name: /Nova recompensa/ }));
      const dialog = within(await screen.findByRole('dialog'));
      await userEvent.type(dialog.getByLabelText('Nome'), 'Algo');
      await userEvent.click(dialog.getByRole('button', { name: 'Criar recompensa' }));

      expect(await dialog.findByRole('alert')).toHaveTextContent('Você já tem 50 recompensas');
    });
  });

  describe('editar e excluir', () => {
    it('edita só nome e descrição: o gatilho não aparece', async () => {
      const { calls } = setup([reward(1)]);
      await userEvent.click(await screen.findByRole('button', { name: 'Editar Prêmio 1' }));
      const dialog = within(await screen.findByRole('dialog'));

      expect(dialog.queryByRole('combobox', { name: 'Tipo de gatilho' })).not.toBeInTheDocument();
      const name = dialog.getByLabelText('Nome');
      await userEvent.clear(name);
      await userEvent.type(name, 'Jantar no japonês');
      await userEvent.type(dialog.getByLabelText('Descrição (opcional)'), 'Com a família');
      await userEvent.click(dialog.getByRole('button', { name: 'Salvar' }));

      await waitFor(() =>
        expect(calls).toContainEqual({
          method: 'PATCH',
          url: '/api/rewards/0192f1a0-7b3c-7000-8000-000000000001',
          body: { title: 'Jantar no japonês', description: 'Com a família' },
        }),
      );
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Recompensa atualizada'));
    });

    it('exclui só depois de confirmar', async () => {
      const { calls } = setup([reward(1)]);
      await userEvent.click(await screen.findByRole('button', { name: 'Excluir Prêmio 1' }));
      const dialog = within(await screen.findByRole('dialog'));
      expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);

      await userEvent.click(dialog.getByRole('button', { name: 'Cancelar' }));
      expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);

      await userEvent.click(await screen.findByRole('button', { name: 'Excluir Prêmio 1' }));
      await userEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', {
          name: 'Excluir recompensa',
        }),
      );
      await waitFor(() =>
        expect(calls).toContainEqual(
          expect.objectContaining({
            method: 'DELETE',
            url: '/api/rewards/0192f1a0-7b3c-7000-8000-000000000001',
          }),
        ),
      );
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Recompensa excluída'));
    });
  });

  it('se a rota falhar, mostra o erro com "Tentar de novo"', async () => {
    setup([], { 'GET /api/rewards': () => json(500, {}) });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar as recompensas.',
    );
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
  });
});
