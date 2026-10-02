import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Goal } from '@lifexp/shared';
import { AREAS, GOAL_ID, json, makeGoal } from '@/features/goals/testing';
import { setAccessToken } from '@/lib/apiClient';
import { GoalsPage } from './GoalsPage';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast, Toaster: () => null }));

interface Options {
  byStatus?: Partial<Record<string, Goal[]>>;
  listStatus?: number;
  postResponse?: () => Response;
}

function setup(options: Options = {}) {
  const calls: { method: string; url: string; body?: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url, body });

      if (url.startsWith('/api/areas')) return json(200, AREAS);
      if (url.startsWith('/api/goals') && method === 'GET') {
        if (options.listStatus) return json(options.listStatus, { message: 'falhou' });
        const status = new URL(url, 'http://x').searchParams.get('status') ?? 'active';
        return json(200, options.byStatus?.[status] ?? []);
      }
      if (url === '/api/goals' && method === 'POST') {
        return options.postResponse?.() ?? json(201, makeGoal({ title: String(body?.title) }));
      }
      return json(404);
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/metas']}>
        <Routes>
          <Route path="/metas" element={<GoalsPage />} />
          <Route path="/metas/:goalId" element={<p>Detalhe da meta</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { calls };
}

describe('GoalsPage', () => {
  beforeEach(() => {
    setAccessToken('token');
    toast.success.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('abre nas metas ativas, com progresso, prazo, área e tempo investido', async () => {
    setup({
      byStatus: {
        active: [
          makeGoal({
            deadline: '2026-12-31',
            investedMinutes: 150,
            progress: { ratio: 0.5, source: 'milestones' },
          }),
        ],
      },
    });

    const card = await screen.findByRole('link', { name: 'Ler 12 livros' });
    expect(card).toHaveAttribute('href', `/metas/${GOAL_ID}`);
    expect(card).toHaveTextContent('1 de 2 marcos');
    expect(card).toHaveTextContent('50%');
    expect(card).toHaveTextContent('Até 31 de dezembro de 2026');
    expect(card).toHaveTextContent('2 h 30 min investidas');
    expect(card).toHaveTextContent('Estudo');
    expect(screen.getByRole('button', { name: 'Ativas' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('mostra o selo "Atrasada" e "Pronta para concluir"', async () => {
    setup({
      byStatus: {
        active: [
          makeGoal({
            overdue: true,
            readyToComplete: true,
            progress: { ratio: 1, source: 'metric' },
          }),
        ],
      },
    });

    const card = await screen.findByRole('link', { name: 'Ler 12 livros' });
    expect(card).toHaveTextContent('Atrasada');
    expect(card).toHaveTextContent('Pronta para concluir');
  });

  it('meta sem como medir não mostra porcentagem e orienta', async () => {
    setup({
      byStatus: { active: [makeGoal({ milestones: [], progress: { ratio: null, source: null } })] },
    });

    const card = await screen.findByRole('link', { name: 'Ler 12 livros' });
    expect(card).toHaveTextContent('Adicione marcos ou uma métrica');
    expect(card).not.toHaveTextContent('%');
  });

  it('trocar o filtro busca aquele status e mostra a lista dele', async () => {
    const { calls } = setup({
      byStatus: {
        active: [makeGoal({ title: 'Aberta' })],
        completed: [makeGoal({ title: 'Feita', status: 'completed' })],
      },
    });
    await screen.findByRole('link', { name: 'Aberta' });

    await userEvent.click(screen.getByRole('button', { name: 'Concluídas' }));

    expect(await screen.findByRole('link', { name: 'Feita' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Aberta' })).not.toBeInTheDocument();
    expect(calls.map((c) => c.url)).toContain('/api/goals?status=completed');
  });

  it('cada filtro vazio explica o que fazer', async () => {
    setup();
    expect(await screen.findByText(/Nenhuma meta ativa/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Concluídas' }));
    expect(await screen.findByText(/A primeira vale \+500 XP/)).toBeInTheDocument();
  });

  it('erro de carregamento oferece tentar de novo', async () => {
    const { calls } = setup({ listStatus: 500 });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar as metas',
    );
    const before = calls.filter((c) => c.url.startsWith('/api/goals')).length;
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() =>
      expect(calls.filter((c) => c.url.startsWith('/api/goals')).length).toBeGreaterThan(before),
    );
  });

  describe('criar meta', () => {
    const open = async () => {
      await screen.findByText(/Nenhuma meta ativa/);
      await userEvent.click(screen.getByRole('button', { name: 'Nova meta' }));
      return within(await screen.findByRole('dialog'));
    };

    it('cria uma meta simples com exatamente o que a API espera e abre o detalhe', async () => {
      const { calls } = setup();
      const dialog = await open();

      await userEvent.type(dialog.getByLabelText('Título'), '  Ler 12 livros ');
      await userEvent.click(dialog.getByRole('button', { name: 'Criar meta' }));

      await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
      expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
        title: 'Ler 12 livros',
        description: null,
        areaId: null,
        deadline: null,
        targetValue: null,
        currentValue: null,
        unit: null,
      });
      expect(await screen.findByText('Detalhe da meta')).toBeInTheDocument();
      expect(toast.success).toHaveBeenCalledWith('Meta “Ler 12 livros” criada');
    });

    it('com "Medir por valor", envia alvo, valor atual e unidade; com área e prazo', async () => {
      const { calls } = setup();
      const dialog = await open();

      await userEvent.type(dialog.getByLabelText('Título'), 'Correr 100 km');
      await userEvent.selectOptions(dialog.getByLabelText('Área (opcional)'), 'Estudo');
      fireEvent.change(dialog.getByLabelText('Prazo (opcional)'), {
        target: { value: '2026-12-31' },
      });
      await userEvent.click(dialog.getByRole('switch', { name: 'Medir por valor' }));
      await userEvent.type(dialog.getByLabelText('Valor-alvo'), '100');
      await userEvent.type(dialog.getByLabelText('Valor atual'), '12.5');
      await userEvent.type(dialog.getByLabelText('Unidade'), 'km');
      await userEvent.click(dialog.getByRole('button', { name: 'Criar meta' }));

      await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
      expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
        title: 'Correr 100 km',
        description: null,
        areaId: '0192f1a0-7b3c-7000-8000-0000000000b1',
        deadline: '2026-12-31',
        targetValue: 100,
        currentValue: 12.5,
        unit: 'km',
      });
    });

    it('desligar "Medir por valor" descarta a métrica digitada', async () => {
      const { calls } = setup();
      const dialog = await open();

      await userEvent.type(dialog.getByLabelText('Título'), 'Meta');
      const toggle = dialog.getByRole('switch', { name: 'Medir por valor' });
      await userEvent.click(toggle);
      await userEvent.type(dialog.getByLabelText('Valor-alvo'), '10');
      await userEvent.click(toggle);
      await userEvent.click(dialog.getByRole('button', { name: 'Criar meta' }));

      await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
      expect(calls.find((c) => c.method === 'POST')!.body).toMatchObject({
        targetValue: null,
        currentValue: null,
        unit: null,
      });
    });

    it('exige o título e não chama a API', async () => {
      const { calls } = setup();
      const dialog = await open();

      await userEvent.click(dialog.getByRole('button', { name: 'Criar meta' }));

      expect(await dialog.findByText('Informe o título da meta')).toBeInTheDocument();
      expect(calls.some((c) => c.method === 'POST')).toBe(false);
    });

    it('valor-alvo zero é recusado no formulário', async () => {
      const { calls } = setup();
      const dialog = await open();

      await userEvent.type(dialog.getByLabelText('Título'), 'Meta');
      await userEvent.click(dialog.getByRole('switch', { name: 'Medir por valor' }));
      await userEvent.type(dialog.getByLabelText('Valor-alvo'), '0');
      await userEvent.click(dialog.getByRole('button', { name: 'Criar meta' }));

      expect(await dialog.findByText('O valor-alvo deve ser maior que zero')).toBeInTheDocument();
      expect(calls.some((c) => c.method === 'POST')).toBe(false);
    });

    it('mostra o erro do servidor e mantém o diálogo aberto', async () => {
      setup({ postResponse: () => json(409, { message: 'A área está arquivada' }) });
      const dialog = await open();

      await userEvent.type(dialog.getByLabelText('Título'), 'Meta');
      await userEvent.click(dialog.getByRole('button', { name: 'Criar meta' }));

      expect(await dialog.findByRole('alert')).toHaveTextContent('A área está arquivada');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});
