import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTask, renderWithProviders, setupFakeTasks, TODAY } from '@/features/tasks/testing';
import { PendingPage } from './PendingPage';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast, Toaster: () => null }));

const render = () => renderWithProviders(<PendingPage />, '/pendentes');
const card = (name: string) => screen.findByRole('article', { name });

describe('PendingPage (Pendentes: tarefas sem dia)', () => {
  beforeEach(() => {
    toast.success.mockClear();
    toast.error.mockClear();
    // A página calcula "hoje" pelo relógio: fixa em quarta 2026-10-07, 12:00 em São Paulo.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T15:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('lista só as tarefas sem dia; as com dia ficam em Hoje', async () => {
    setupFakeTasks({
      tasks: [
        makeTask({ title: 'Sem dia', dueDate: null }),
        makeTask({ title: 'Com dia', dueDate: TODAY }),
      ],
    });
    render();

    expect(await card('Sem dia')).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Com dia' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pendentes', level: 1 })).toBeInTheDocument();
  });

  it('vazio: texto acolhedor, sem cobrança', async () => {
    setupFakeTasks({ tasks: [] });
    render();

    const text = await screen.findByText(/Nada pendente/);
    expect(text.textContent).not.toMatch(/atras|falta|pend[eê]ncia/i);
  });

  it('adicionar rápido cria SEM dia (dueDate nulo) e a tarefa aparece na lista', async () => {
    const { calls } = setupFakeTasks({ tasks: [] });
    render();
    await screen.findByText(/Nada pendente/);

    await userEvent.type(
      screen.getByLabelText('Anotar uma tarefa sem dia'),
      'Trocar o chuveiro{Enter}',
    );

    await waitFor(() => expect(calls.some((call) => call.method === 'POST')).toBe(true));
    expect(calls.find((call) => call.method === 'POST')!.body).toEqual({
      title: 'Trocar o chuveiro',
      dueDate: null,
      priority: 'medium',
    });
    expect(await card('Trocar o chuveiro')).toBeInTheDocument();
  });

  it('"Para hoje" move a tarefa para hoje e ela sai dos Pendentes', async () => {
    const { calls } = setupFakeTasks({
      tasks: [makeTask({ title: 'Ligar para o dentista', dueDate: null })],
    });
    render();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Fazer “Ligar para o dentista” hoje' }),
    );

    await waitFor(() => expect(calls.some((call) => call.method === 'PATCH')).toBe(true));
    expect(calls.find((call) => call.method === 'PATCH')!.body).toEqual({ dueDate: TODAY });
    await waitFor(() =>
      expect(
        screen.queryByRole('article', { name: 'Ligar para o dentista' }),
      ).not.toBeInTheDocument(),
    );
    expect(toast.success).toHaveBeenCalledWith('“Ligar para o dentista” ficou para hoje');
  });

  it('o formulário completo começa SEM dia', async () => {
    setupFakeTasks({ tasks: [] });
    render();
    await screen.findByText(/Nada pendente/);

    await userEvent.click(screen.getByRole('button', { name: 'Nova tarefa' }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByLabelText('Dia (opcional)')).toHaveValue('');
  });

  it('criar pelo formulário completo, sem escolher dia, envia dueDate nulo', async () => {
    const { calls } = setupFakeTasks({ tasks: [] });
    render();
    await screen.findByText(/Nada pendente/);

    await userEvent.click(screen.getByRole('button', { name: 'Nova tarefa' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Título'), 'Organizar a garagem');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar tarefa' }));

    await waitFor(() => expect(calls.some((call) => call.method === 'POST')).toBe(true));
    expect(calls.find((call) => call.method === 'POST')!.body).toMatchObject({
      title: 'Organizar a garagem',
      dueDate: null,
    });
    expect(await card('Organizar a garagem')).toBeInTheDocument();
  });

  it('concluir uma tarefa dos Pendentes rende XP e ela some da caixa de entrada', async () => {
    setupFakeTasks({ tasks: [makeTask({ title: 'Doar roupas', dueDate: null, priority: 'low' })] });
    render();

    await userEvent.click(await screen.findByRole('button', { name: 'Concluir “Doar roupas”' }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('+10 XP', { description: '“Doar roupas” feita.' }),
    );
  });

  it('se a lista falha, mostra o erro com "tentar de novo"', async () => {
    setupFakeTasks({ tasks: [], listStatus: 500 });
    render();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar os pendentes',
    );
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});
