import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Goal } from '@lifexp/shared';
import { AREAS, GOAL_ID, MS_1, MS_2, json, makeGoal, makeResult } from '@/features/goals/testing';
import { setAccessToken } from '@/lib/apiClient';
import { GoalDetailPage } from './GoalDetailPage';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast, Toaster: () => null }));

interface Options {
  goal?: Goal;
  /** Resposta (status, corpo) para uma chamada de escrita, por "MÉTODO url". */
  overrides?: Record<string, () => Response>;
  history?: unknown[];
}

function setup(options: Options = {}) {
  let goal = options.goal ?? makeGoal();
  const calls: { method: string; url: string; body?: Record<string, unknown> }[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      if (url.startsWith('/api/areas')) return json(200, AREAS);
      if (url === `/api/goals/${GOAL_ID}` && method === 'GET') return json(200, goal);
      if (url === `/api/goals/${GOAL_ID}/history`) return json(200, options.history ?? []);

      calls.push({ method, url, body });
      const override = options.overrides?.[`${method} ${url}`];
      if (override) return override();

      if (url === `/api/goals/${GOAL_ID}/status` && method === 'PUT') {
        const completed = body?.status === 'completed';
        const was = goal.status === 'completed';
        goal = { ...goal, status: body?.status as Goal['status'] };
        return json(200, makeResult(goal, completed && !was ? 500 : was && !completed ? -500 : 0));
      }
      const ms = url.match(/\/milestones\/([^/]+)\/completion$/);
      if (ms && method === 'POST') {
        goal = {
          ...goal,
          milestones: goal.milestones.map((m) => (m.id === ms[1] ? { ...m, done: true } : m)),
        };
        return json(200, makeResult(goal, 100));
      }
      if (ms && method === 'DELETE') {
        goal = {
          ...goal,
          milestones: goal.milestones.map((m) => (m.id === ms[1] ? { ...m, done: false } : m)),
        };
        return json(200, makeResult(goal, -100));
      }
      if (url === `/api/goals/${GOAL_ID}/milestones` && method === 'POST') {
        goal = {
          ...goal,
          milestones: [
            ...goal.milestones,
            {
              id: crypto.randomUUID(),
              title: String(body?.title),
              done: false,
              doneAt: null,
              position: 9,
            },
          ],
        };
        return json(201, goal);
      }
      if (url.match(/\/milestones\/[^/]+$/) && method === 'DELETE') {
        goal = { ...goal, milestones: goal.milestones.filter((m) => !url.endsWith(m.id)) };
        return json(200, goal);
      }
      if (url === `/api/goals/${GOAL_ID}` && method === 'PATCH') {
        goal = { ...goal, ...(body as object) } as Goal;
        return json(200, goal);
      }
      if (url === `/api/goals/${GOAL_ID}` && method === 'DELETE')
        return new Response(null, { status: 204 });
      return json(404);
    }),
  );

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/metas/${GOAL_ID}`]}>
        <Routes>
          <Route path="/metas" element={<p>Lista de metas</p>} />
          <Route path="/metas/:goalId" element={<GoalDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { calls };
}

const writes = (calls: { method: string; url: string }[]) =>
  calls.map((call) => `${call.method} ${call.url}`);

describe('GoalDetailPage', () => {
  beforeEach(() => {
    setAccessToken('token');
    toast.success.mockClear();
    toast.error.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('mostra título, área, prazo, progresso, marcos e tempo investido', async () => {
    setup({
      goal: makeGoal({ description: 'Um por mês', deadline: '2026-12-31', investedMinutes: 150 }),
      history: [
        {
          blockId: '0192f1a0-7b3c-7000-8000-0000000000e1',
          occurrenceDate: '2026-10-07',
          completedAt: '2026-10-07T15:00:00.000Z',
          durationMin: 90,
          xpAmount: 90,
          activityId: '0192f1a0-7b3c-7000-8000-0000000000a1',
          activityName: 'Leitura',
        },
      ],
    });

    expect(
      await screen.findByRole('heading', { name: 'Ler 12 livros', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Um por mês')).toBeInTheDocument();
    expect(screen.getByText('Até 31 de dezembro de 2026')).toBeInTheDocument();
    expect(await screen.findByText('Estudo')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Progresso da meta' })).toHaveAttribute(
      'aria-valuenow',
      '50',
    );
    expect(screen.getByRole('checkbox', { name: 'Primeiro livro' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Segundo livro' })).not.toBeChecked();
    expect(screen.getByText('2 h 30 min')).toBeInTheDocument();
    expect(await screen.findByText('Leitura')).toBeInTheDocument();
    expect(screen.getByText(/7 de outubro de 2026 · 1 h 30 min/)).toBeInTheDocument();
  });

  it('sem blocos cumpridos, explica como ligar um bloco à meta', async () => {
    setup({ goal: makeGoal({ investedMinutes: 0 }) });
    expect(await screen.findByText(/escolha esta meta para ele contar aqui/)).toBeInTheDocument();
  });

  describe('marcos', () => {
    it('concluir um marco chama a API e avisa o XP ganho', async () => {
      const { calls } = setup();

      await userEvent.click(await screen.findByRole('checkbox', { name: 'Segundo livro' }));

      await waitFor(() =>
        expect(writes(calls)).toContain(`POST /api/goals/${GOAL_ID}/milestones/${MS_2}/completion`),
      );
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith('+100 XP', {
          description: 'Marco “Segundo livro” concluído.',
        }),
      );
      expect(await screen.findByRole('checkbox', { name: 'Segundo livro' })).toBeChecked();
    });

    it('desfazer um marco avisa o XP devolvido', async () => {
      const { calls } = setup();

      await userEvent.click(await screen.findByRole('checkbox', { name: 'Primeiro livro' }));

      await waitFor(() =>
        expect(writes(calls)).toContain(
          `DELETE /api/goals/${GOAL_ID}/milestones/${MS_1}/completion`,
        ),
      );
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith('Marco “Primeiro livro” desfeito', {
          description: '100 XP devolvidos.',
        }),
      );
    });

    it('comemora a subida de nível causada por um marco', async () => {
      setup({
        overrides: {
          [`POST /api/goals/${GOAL_ID}/milestones/${MS_2}/completion`]: () =>
            json(200, makeResult(makeGoal(), 100, [2, 3])),
        },
      });

      await userEvent.click(await screen.findByRole('checkbox', { name: 'Segundo livro' }));

      expect(await screen.findByText('Você chegou ao nível 3')).toBeInTheDocument();
    });

    it('sem subir de nível, não comemora', async () => {
      setup();
      await userEvent.click(await screen.findByRole('checkbox', { name: 'Segundo livro' }));
      await waitFor(() => expect(toast.success).toHaveBeenCalled());
      expect(screen.queryByText(/Você chegou ao nível/)).not.toBeInTheDocument();
    });

    it('adiciona um marco com o título digitado e limpa o campo', async () => {
      const { calls } = setup();

      const input = await screen.findByLabelText('Novo marco');
      await userEvent.type(input, 'Terceiro livro');
      await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

      await waitFor(() =>
        expect(calls).toContainEqual({
          method: 'POST',
          url: `/api/goals/${GOAL_ID}/milestones`,
          body: { title: 'Terceiro livro' },
        }),
      );
      expect(await screen.findByRole('checkbox', { name: 'Terceiro livro' })).toBeInTheDocument();
      expect(input).toHaveValue('');
    });

    it('o botão Adicionar só vale com título', async () => {
      setup();
      expect(await screen.findByRole('button', { name: 'Adicionar' })).toBeDisabled();
    });

    it('exclui um marco', async () => {
      const { calls } = setup();

      await userEvent.click(
        await screen.findByRole('button', { name: 'Excluir marco Segundo livro' }),
      );

      await waitFor(() =>
        expect(writes(calls)).toContain(`DELETE /api/goals/${GOAL_ID}/milestones/${MS_2}`),
      );
      await waitFor(() =>
        expect(screen.queryByRole('checkbox', { name: 'Segundo livro' })).not.toBeInTheDocument(),
      );
    });

    it('em meta concluída os marcos ficam travados e a tela explica', async () => {
      setup({ goal: makeGoal({ status: 'completed' }) });

      expect(await screen.findByRole('checkbox', { name: 'Primeiro livro' })).toBeDisabled();
      expect(screen.getByRole('checkbox', { name: 'Segundo livro' })).toBeDisabled();
      expect(
        screen.getByText(/Reabra a meta para concluir ou desfazer marcos/),
      ).toBeInTheDocument();
    });

    it('um marco que desbloqueia recompensa avisa dela', async () => {
      setup({
        overrides: {
          [`POST /api/goals/${GOAL_ID}/milestones/${MS_2}/completion`]: () =>
            json(200, {
              ...makeResult(makeGoal(), 100),
              rewardsReached: [
                { id: '0192f1a0-7b3c-7000-8000-0000000000e1', title: 'Jantar fora' },
              ],
            }),
        },
      });

      await userEvent.click(await screen.findByRole('checkbox', { name: 'Segundo livro' }));

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith('Recompensa desbloqueada: Jantar fora', {
          description: 'Você pode resgatá-la em Recompensas.',
        }),
      );
    });

    it('mostra o erro do servidor num aviso', async () => {
      setup({
        overrides: {
          [`POST /api/goals/${GOAL_ID}/milestones/${MS_2}/completion`]: () =>
            json(409, { message: 'A meta está concluída ou abandonada' }),
        },
      });

      await userEvent.click(await screen.findByRole('checkbox', { name: 'Segundo livro' }));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('A meta está concluída ou abandonada'),
      );
    });
  });

  describe('status da meta', () => {
    it('meta ativa oferece concluir (+500 XP), pausar e abandonar', async () => {
      setup();
      expect(await screen.findByRole('button', { name: /Concluir meta/ })).toHaveTextContent(
        '+500 XP',
      );
      expect(screen.getByRole('button', { name: 'Pausar' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Abandonar' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Reabrir/ })).not.toBeInTheDocument();
    });

    it('concluir a meta chama a API e comemora com o XP', async () => {
      const { calls } = setup();

      await userEvent.click(await screen.findByRole('button', { name: /Concluir meta/ }));

      await waitFor(() =>
        expect(calls).toContainEqual({
          method: 'PUT',
          url: `/api/goals/${GOAL_ID}/status`,
          body: { status: 'completed' },
        }),
      );
      const dialog = within(await screen.findByRole('dialog'));
      expect(dialog.getByText('Meta concluída')).toBeInTheDocument();
      expect(dialog.getByRole('heading', { name: 'Ler 12 livros' })).toBeInTheDocument();
      expect(dialog.getByText('+500 XP')).toBeInTheDocument();
    });

    it('concluir a meta desbloqueia "Sonho realizado" e avisa', async () => {
      setup({
        overrides: {
          [`PUT /api/goals/${GOAL_ID}/status`]: () =>
            json(200, {
              ...makeResult(makeGoal({ status: 'completed' }), 500),
              achievementsUnlocked: ['dream_realized'],
            }),
        },
      });

      await userEvent.click(await screen.findByRole('button', { name: /Concluir meta/ }));

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith('Conquista desbloqueada: Sonho realizado', {
          description: 'Conclua a sua primeira meta.',
        }),
      );
    });

    it('concluir uma meta que já estava concluída (sem XP novo) não comemora', async () => {
      setup({
        overrides: {
          [`PUT /api/goals/${GOAL_ID}/status`]: () =>
            json(200, makeResult(makeGoal({ status: 'completed' }), 0)),
        },
      });

      await userEvent.click(await screen.findByRole('button', { name: /Concluir meta/ }));

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Meta concluída'));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('a subida de nível da meta aparece depois da comemoração fechar', async () => {
      setup({
        overrides: {
          [`PUT /api/goals/${GOAL_ID}/status`]: () =>
            json(200, makeResult(makeGoal({ status: 'completed' }), 500, [2, 4])),
        },
      });

      await userEvent.click(await screen.findByRole('button', { name: /Concluir meta/ }));
      expect(await screen.findByText('Meta concluída')).toBeInTheDocument();
      expect(screen.queryByText('Você chegou ao nível 4')).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
      expect(await screen.findByText('Você chegou ao nível 4')).toBeInTheDocument();
    });

    it('meta concluída só oferece reabrir; reabrir avisa o XP devolvido e não comemora', async () => {
      const { calls } = setup({ goal: makeGoal({ status: 'completed' }) });

      const reopen = await screen.findByRole('button', { name: /Reabrir meta/ });
      expect(reopen).toHaveTextContent('Devolve os 500 XP da meta');
      expect(screen.queryByRole('button', { name: /Concluir meta/ })).not.toBeInTheDocument();
      await userEvent.click(reopen);

      await waitFor(() =>
        expect(calls).toContainEqual({
          method: 'PUT',
          url: `/api/goals/${GOAL_ID}/status`,
          body: { status: 'active' },
        }),
      );
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith('Meta reaberta', {
          description: '500 XP devolvidos.',
        }),
      );
      expect(screen.queryByText('Meta concluída')).not.toBeInTheDocument();
    });

    it('pausar e abandonar só avisam o novo status, sem XP', async () => {
      const { calls } = setup();

      await userEvent.click(await screen.findByRole('button', { name: 'Pausar' }));
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Meta pausada'));
      expect(calls.at(-1)!.body).toEqual({ status: 'paused' });
      expect(screen.queryByText('Meta concluída')).not.toBeInTheDocument();
      expect(await screen.findByRole('button', { name: 'Retomar' })).toBeInTheDocument();
    });

    it('mostra "Pronta para concluir" quando o progresso chega a 100%', async () => {
      setup({
        goal: makeGoal({ readyToComplete: true, progress: { ratio: 1, source: 'milestones' } }),
      });
      expect(await screen.findByText(/pronta para você concluir/)).toBeInTheDocument();
    });

    it('mostra o selo "Atrasada"', async () => {
      setup({ goal: makeGoal({ overdue: true, deadline: '2026-10-01' }) });
      expect(await screen.findByText('Atrasada')).toBeInTheDocument();
    });
  });

  describe('valor atual (métrica)', () => {
    const metric = makeGoal({
      targetValue: 200,
      currentValue: 50,
      unit: 'km',
      progress: { ratio: 0.25, source: 'metric' },
    });

    it('sem métrica, a seção de valor atual não aparece', async () => {
      setup();
      await screen.findByRole('heading', { name: 'Ler 12 livros', level: 1 });
      expect(screen.queryByLabelText(/Valor atual/)).not.toBeInTheDocument();
    });

    it('mostra o valor e atualiza só o valor atual', async () => {
      const { calls } = setup({ goal: metric });

      const input = await screen.findByLabelText('Valor atual (km)');
      expect(input).toHaveValue(50);
      await userEvent.clear(input);
      await userEvent.type(input, '80');
      await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

      await waitFor(() =>
        expect(calls).toContainEqual({
          method: 'PATCH',
          url: `/api/goals/${GOAL_ID}`,
          body: { currentValue: 80 },
        }),
      );
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Progresso atualizado'));
    });

    it('não envia valor vazio ou negativo', async () => {
      const { calls } = setup({ goal: metric });
      const input = await screen.findByLabelText('Valor atual (km)');

      await userEvent.clear(input);
      expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
      await userEvent.type(input, '-3');
      expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
      expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
    });
  });

  describe('editar e excluir', () => {
    it('edita o título pelo diálogo, com os campos preenchidos', async () => {
      const { calls } = setup();

      await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
      const dialog = within(await screen.findByRole('dialog'));
      const title = dialog.getByLabelText('Título');
      expect(title).toHaveValue('Ler 12 livros');
      await userEvent.clear(title);
      await userEvent.type(title, 'Ler 24 livros');
      await userEvent.click(dialog.getByRole('button', { name: 'Salvar' }));

      await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
      expect(calls.find((c) => c.method === 'PATCH')!.body).toMatchObject({
        title: 'Ler 24 livros',
        areaId: '0192f1a0-7b3c-7000-8000-0000000000b1',
        targetValue: null,
      });
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Meta atualizada'));
    });

    it('excluir pede confirmação, explica o XP e volta para a lista', async () => {
      const { calls } = setup();

      await userEvent.click(await screen.findByRole('button', { name: 'Excluir' }));
      const dialog = within(await screen.findByRole('dialog'));
      expect(dialog.getByText(/o XP que renderam volta/)).toBeInTheDocument();
      expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

      await userEvent.click(dialog.getByRole('button', { name: 'Excluir meta' }));

      await waitFor(() => expect(writes(calls)).toContain(`DELETE /api/goals/${GOAL_ID}`));
      expect(await screen.findByText('Lista de metas')).toBeInTheDocument();
      expect(toast.success).toHaveBeenCalledWith('Meta “Ler 12 livros” excluída');
    });

    it('cancelar a exclusão não chama a API', async () => {
      const { calls } = setup();

      await userEvent.click(await screen.findByRole('button', { name: 'Excluir' }));
      await userEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }),
      );

      expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    });
  });

  it('meta que não existe mostra erro com caminho de volta', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => json(404, { message: 'Meta não encontrada' })),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/metas/${GOAL_ID}`]}>
          <Routes>
            <Route path="/metas/:goalId" element={<GoalDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível abrir esta meta');
    expect(screen.getByRole('link', { name: 'Voltar às metas' })).toHaveAttribute('href', '/metas');
  });
});
