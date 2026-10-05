import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TasksSection } from './TasksSection';
import { AREA_ID, TODAY, itemId, makeTask, renderWithProviders, setupFakeTasks } from './testing';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast, Toaster: () => null }));

const section = () => screen.findByRole('region', { name: 'Tarefas de hoje' });
const card = (name: string | RegExp) => screen.findByRole('article', { name });
const render = (onLevelUp?: (level: number) => void) =>
  renderWithProviders(<TasksSection today={TODAY} onLevelUp={onLevelUp} />);

describe('TasksSection (tarefas na tela Hoje)', () => {
  beforeEach(() => {
    toast.success.mockClear();
    toast.error.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lista as tarefas do dia, com prioridade, XP previsto e a contagem de concluídas', async () => {
    setupFakeTasks({
      tasks: [
        makeTask({ title: 'Pagar a conta', priority: 'high' }),
        makeTask({ title: 'Regar as plantas', priority: 'low' }),
      ],
      xpToday: 40,
    });
    render();

    const first = await card('Pagar a conta');
    expect(within(first).getByText('Importante')).toBeInTheDocument();
    expect(within(first).getByText('+40 XP')).toBeInTheDocument();
    expect(within(await card('Regar as plantas')).getByText('+10 XP')).toBeInTheDocument();
    expect(screen.getByText('0 de 2 concluídas')).toBeInTheDocument();
    expect(screen.getByText('40 / 100 XP de tarefas hoje')).toBeInTheDocument();
  });

  it('mostra o nome da área e a anotação como texto puro', async () => {
    setupFakeTasks({
      tasks: [makeTask({ title: 'Estudar', areaId: AREA_ID, note: 'Capítulo <b>3</b>' })],
    });
    render();

    const article = await card('Estudar');
    expect(await within(article).findByText('Estudos')).toBeInTheDocument();
    expect(within(article).getByText('Capítulo <b>3</b>')).toBeInTheDocument();
    expect(article.querySelector('b')).toBeNull();
  });

  it('a tarefa que ficou para trás aparece como "vinda de", sem dizer "atrasada"', async () => {
    setupFakeTasks({ tasks: [makeTask({ title: 'Ligar para o banco', dueDate: '2026-10-03' })] });
    render();

    const article = await card('Ligar para o banco');
    expect(within(article).getByText('vinda de 3 de outubro de 2026')).toBeInTheDocument();
    expect(article.textContent).not.toMatch(/atras/i);
  });

  it('sem tarefas, mostra um convite e o caminho para Pendentes', async () => {
    setupFakeTasks({ tasks: [] });
    render();

    expect(await screen.findByText(/Nenhuma tarefa para hoje/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pendentes' })).toHaveAttribute('href', '/pendentes');
  });

  describe('adicionar rápido', () => {
    it('digita, Enter: cria para hoje, prioridade média, e limpa o campo', async () => {
      const { calls } = setupFakeTasks({ tasks: [] });
      render();
      await section();

      const input = screen.getByLabelText('Adicionar uma tarefa para hoje');
      await userEvent.type(input, '  Comprar pão {Enter}');

      await waitFor(() => expect(calls.some((call) => call.method === 'POST')).toBe(true));
      expect(calls.find((call) => call.method === 'POST')!.body).toEqual({
        title: 'Comprar pão',
        dueDate: TODAY,
        priority: 'medium',
      });
      await waitFor(() => expect(input).toHaveValue(''));
      expect(await card('Comprar pão')).toBeInTheDocument();
    });

    it('o botão fica desabilitado sem texto e não envia só espaços', async () => {
      const { calls } = setupFakeTasks({ tasks: [] });
      render();
      await section();

      const button = screen.getByRole('button', { name: 'Adicionar' });
      expect(button).toBeDisabled();
      await userEvent.type(screen.getByLabelText('Adicionar uma tarefa para hoje'), '   {Enter}');

      expect(button).toBeDisabled();
      expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);
    });

    it('erro do servidor vira aviso e mantém o texto digitado', async () => {
      setupFakeTasks({
        tasks: [],
        fail: { 'POST /api/tasks': { status: 409, message: 'Você já tem 500 tarefas em aberto' } },
      });
      render();
      await section();

      const input = screen.getByLabelText('Adicionar uma tarefa para hoje');
      await userEvent.type(input, 'Mais uma{Enter}');

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('Você já tem 500 tarefas em aberto'),
      );
      expect(input).toHaveValue('Mais uma');
    });
  });

  describe('concluir e desfazer', () => {
    it('concluir envia o POST, avisa o XP e marca a tarefa como feita', async () => {
      const { calls } = setupFakeTasks({
        tasks: [makeTask({ title: 'Pagar a conta', priority: 'high' })],
      });
      render();

      await userEvent.click(
        await screen.findByRole('button', { name: 'Concluir “Pagar a conta”' }),
      );

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith('+40 XP', {
          description: '“Pagar a conta” feita.',
        }),
      );
      expect(calls.some((call) => call.method === 'POST' && call.url.endsWith('/complete'))).toBe(
        true,
      );
      const done = await screen.findByRole('button', { name: 'Desfazer “Pagar a conta”' });
      expect(done).toHaveAttribute('aria-pressed', 'true');
      expect(await screen.findByText('1 de 1 concluídas')).toBeInTheDocument();
    });

    it('desfazer envia o DELETE e avisa quantos XP voltaram', async () => {
      const { calls } = setupFakeTasks({
        tasks: [
          makeTask({
            title: 'Pagar a conta',
            priority: 'high',
            completedAt: '2026-10-07T15:00:00.000Z',
            xpAwarded: 40,
          }),
        ],
        xpToday: 40,
        totalXp: 40,
      });
      render();

      await userEvent.click(
        await screen.findByRole('button', { name: 'Desfazer “Pagar a conta”' }),
      );

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith('Conclusão de “Pagar a conta” desfeita', {
          description: '40 XP devolvidos.',
        }),
      );
      expect(calls.some((call) => call.method === 'DELETE' && call.url.endsWith('/complete'))).toBe(
        true,
      );
      expect(
        await screen.findByRole('button', { name: 'Concluir “Pagar a conta”' }),
      ).toBeInTheDocument();
    });

    it('com o teto diário atingido, conclui sem XP e explica sem soar como erro', async () => {
      setupFakeTasks({ tasks: [makeTask({ title: 'Mais uma', priority: 'high' })], xpToday: 100 });
      render();

      await userEvent.click(await screen.findByRole('button', { name: 'Concluir “Mais uma”' }));

      await waitFor(() => expect(toast.success).toHaveBeenCalled());
      const [title, options] = toast.success.mock.calls[0]!;
      expect(title).toBe('Tarefa feita!');
      expect(options.description).toContain('máximo de XP de tarefas de hoje');
      expect(toast.error).not.toHaveBeenCalled();
      const article = await card('Mais uma');
      expect(await within(article).findByText('Feita')).toBeInTheDocument();
      expect(within(article).getByText(/Feita sem XP/)).toBeInTheDocument();
    });

    it('avisa a subida de nível', async () => {
      setupFakeTasks({ tasks: [makeTask({ title: 'Grande', priority: 'high' })], totalXp: 80 });
      const onLevelUp = vi.fn();
      render(onLevelUp);

      await userEvent.click(await screen.findByRole('button', { name: 'Concluir “Grande”' }));

      await waitFor(() => expect(onLevelUp).toHaveBeenCalledWith(2));
    });

    it('sem subir de nível, não comemora', async () => {
      setupFakeTasks({ tasks: [makeTask({ title: 'Pequena', priority: 'low' })] });
      const onLevelUp = vi.fn();
      render(onLevelUp);

      await userEvent.click(await screen.findByRole('button', { name: 'Concluir “Pequena”' }));

      await waitFor(() => expect(toast.success).toHaveBeenCalled());
      expect(onLevelUp).not.toHaveBeenCalled();
    });

    it('erro do servidor ao concluir vira aviso e a tarefa continua em aberto', async () => {
      const task = makeTask({ title: 'Pagar a conta' });
      setupFakeTasks({
        tasks: [task],
        fail: {
          [`POST /api/tasks/${task.id}/complete`]: {
            status: 404,
            message: 'Tarefa não encontrada',
          },
        },
      });
      render();

      await userEvent.click(
        await screen.findByRole('button', { name: 'Concluir “Pagar a conta”' }),
      );

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Tarefa não encontrada'));
      expect(screen.getByRole('button', { name: 'Concluir “Pagar a conta”' })).toBeEnabled();
    });
  });

  describe('arquivar e mover', () => {
    it('arquivar envia o DELETE e a tarefa some', async () => {
      const { calls } = setupFakeTasks({ tasks: [makeTask({ title: 'Velha' })] });
      render();

      await userEvent.click(await screen.findByRole('button', { name: 'Arquivar “Velha”' }));

      await waitFor(() =>
        expect(screen.queryByRole('article', { name: 'Velha' })).not.toBeInTheDocument(),
      );
      expect(
        calls.some((call) => call.method === 'DELETE' && !call.url.endsWith('/complete')),
      ).toBe(true);
      expect(toast.success).toHaveBeenCalledWith('“Velha” arquivada');
    });

    it('"Para hoje" aparece só em tarefa de outro dia e muda o dia para hoje', async () => {
      const { calls } = setupFakeTasks({
        tasks: [
          makeTask({ title: 'De ontem', dueDate: '2026-10-06' }),
          makeTask({ title: 'De hoje' }),
        ],
      });
      render();

      await card('De hoje');
      expect(
        screen.queryByRole('button', { name: 'Fazer “De hoje” hoje' }),
      ).not.toBeInTheDocument();
      await userEvent.click(await screen.findByRole('button', { name: 'Fazer “De ontem” hoje' }));

      await waitFor(() => expect(calls.some((call) => call.method === 'PATCH')).toBe(true));
      expect(calls.find((call) => call.method === 'PATCH')!.body).toEqual({ dueDate: TODAY });
      const article = await card('De ontem');
      await waitFor(() => expect(within(article).queryByText(/vinda de/)).not.toBeInTheDocument());
    });

    it('tarefa concluída não oferece "Para hoje"', async () => {
      setupFakeTasks({
        tasks: [
          makeTask({
            title: 'Feita',
            dueDate: '2026-10-01',
            completedAt: '2026-10-07T15:00:00.000Z',
            xpAwarded: 20,
          }),
        ],
      });
      render();

      await card('Feita');
      expect(screen.queryByRole('button', { name: 'Fazer “Feita” hoje' })).not.toBeInTheDocument();
    });
  });

  describe('passos (checklist)', () => {
    it('mostra o progresso e abre a lista; marcar um passo não conclui a tarefa', async () => {
      const task = makeTask({
        title: 'Viagem',
        items: [
          {
            id: itemId(1),
            title: 'malas',
            done: true,
            doneAt: '2026-10-07T15:00:00.000Z',
            position: 0,
          },
          { id: itemId(2), title: 'passagens', done: false, doneAt: null, position: 1 },
        ],
      });
      const { calls } = setupFakeTasks({ tasks: [task] });
      render();

      await userEvent.click(await screen.findByRole('button', { name: 'Passos 1/2' }));
      await userEvent.click(screen.getByRole('checkbox', { name: 'passagens' }));

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Passos 2/2' })).toBeInTheDocument(),
      );
      expect(calls.find((call) => call.method === 'PATCH')!.body).toEqual({ done: true });
      expect(screen.getByRole('button', { name: 'Concluir “Viagem”' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      expect(calls.some((call) => call.url.endsWith('/complete'))).toBe(false);
    });

    it('adiciona um passo digitando e remove outro', async () => {
      const task = makeTask({
        title: 'Viagem',
        items: [{ id: itemId(1), title: 'malas', done: false, doneAt: null, position: 0 }],
      });
      const { calls } = setupFakeTasks({ tasks: [task] });
      render();

      await userEvent.click(await screen.findByRole('button', { name: 'Passos 0/1' }));
      await userEvent.type(screen.getByLabelText('Novo passo de Viagem'), 'hotel{Enter}');
      await screen.findByRole('checkbox', { name: 'hotel' });
      expect(
        calls.find((call) => call.method === 'POST' && call.url.endsWith('/items'))!.body,
      ).toEqual({
        title: 'hotel',
      });

      await userEvent.click(screen.getByRole('button', { name: 'Remover o passo “malas”' }));
      await waitFor(() =>
        expect(screen.queryByRole('checkbox', { name: 'malas' })).not.toBeInTheDocument(),
      );
    });

    it('o botão de adicionar passo fica desabilitado sem texto', async () => {
      setupFakeTasks({
        tasks: [
          makeTask({
            title: 'Viagem',
            items: [{ id: itemId(1), title: 'malas', done: false, doneAt: null, position: 0 }],
          }),
        ],
      });
      render();

      await userEvent.click(await screen.findByRole('button', { name: 'Passos 0/1' }));

      expect(screen.getByRole('button', { name: 'Adicionar passo' })).toBeDisabled();
    });
  });

  describe('formulário completo', () => {
    it('"Nova tarefa" cria com todos os campos (dia padrão: hoje)', async () => {
      const { calls } = setupFakeTasks({ tasks: [] });
      render();
      await section();

      await userEvent.click(screen.getByRole('button', { name: 'Nova tarefa' }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByLabelText('Dia (opcional)')).toHaveValue(TODAY);
      await userEvent.type(within(dialog).getByLabelText('Título'), 'Entregar o relatório');
      await userEvent.click(within(dialog).getByRole('radio', { name: 'Importante' }));
      await userEvent.selectOptions(
        await within(dialog).findByLabelText('Área (opcional)'),
        'Estudos',
      );
      await userEvent.type(
        within(dialog).getByLabelText('Anotação (opcional)'),
        'Enviar por e-mail',
      );
      await userEvent.click(within(dialog).getByRole('button', { name: 'Criar tarefa' }));

      await waitFor(() => expect(calls.some((call) => call.method === 'POST')).toBe(true));
      expect(calls.find((call) => call.method === 'POST')!.body).toEqual({
        title: 'Entregar o relatório',
        note: 'Enviar por e-mail',
        dueDate: TODAY,
        priority: 'high',
        areaId: AREA_ID,
        goalId: null,
      });
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(toast.success).toHaveBeenCalledWith('Tarefa “Entregar o relatório” criada');
    });

    it('sem título, mostra o erro embaixo do campo e não chama a API', async () => {
      const { calls } = setupFakeTasks({ tasks: [] });
      render();
      await section();

      await userEvent.click(screen.getByRole('button', { name: 'Nova tarefa' }));
      const dialog = await screen.findByRole('dialog');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Criar tarefa' }));

      expect(await within(dialog).findByText('Informe o título da tarefa')).toBeInTheDocument();
      expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);
    });

    it('os atalhos de dia: Hoje, Amanhã e Sem dia (Pendentes)', async () => {
      setupFakeTasks({ tasks: [] });
      render();
      await section();

      await userEvent.click(screen.getByRole('button', { name: 'Nova tarefa' }));
      const dialog = await screen.findByRole('dialog');
      const due = within(dialog).getByLabelText('Dia (opcional)');

      await userEvent.click(within(dialog).getByRole('button', { name: 'Amanhã' }));
      expect(due).toHaveValue('2026-10-08');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Sem dia (Pendentes)' }));
      expect(due).toHaveValue('');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Hoje' }));
      expect(due).toHaveValue(TODAY);
    });

    it('editar já vem preenchido e envia as mudanças (nulo limpa a anotação)', async () => {
      const task = makeTask({ title: 'Pagar a conta', note: 'vence hoje', priority: 'low' });
      const { calls } = setupFakeTasks({ tasks: [task] });
      render();

      await userEvent.click(await screen.findByRole('button', { name: 'Editar “Pagar a conta”' }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByLabelText('Título')).toHaveValue('Pagar a conta');
      expect(within(dialog).getByLabelText('Anotação (opcional)')).toHaveValue('vence hoje');
      expect(within(dialog).getByRole('radio', { name: 'Simples' })).toBeChecked();

      fireEvent.change(within(dialog).getByLabelText('Título'), {
        target: { value: 'Pagar a luz' },
      });
      await userEvent.clear(within(dialog).getByLabelText('Anotação (opcional)'));
      await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

      await waitFor(() => expect(calls.some((call) => call.method === 'PATCH')).toBe(true));
      expect(calls.find((call) => call.method === 'PATCH')!.body).toEqual({
        title: 'Pagar a luz',
        note: null,
        dueDate: TODAY,
        priority: 'low',
        areaId: null,
        goalId: null,
      });
      expect(toast.success).toHaveBeenCalledWith('Tarefa atualizada');
    });

    it('mostra o erro do servidor e mantém o formulário aberto', async () => {
      const task = makeTask({ title: 'Pagar a conta' });
      setupFakeTasks({
        tasks: [task],
        fail: {
          [`PATCH /api/tasks/${task.id}`]: { status: 404, message: 'Tarefa não encontrada' },
        },
      });
      render();

      await userEvent.click(await screen.findByRole('button', { name: 'Editar “Pagar a conta”' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.change(within(dialog).getByLabelText('Título'), { target: { value: 'Outro' } });
      await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Tarefa não encontrada');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('falhas', () => {
    it('se a lista falha, só esta seção avisa (com "tentar de novo"), sem derrubar nada', async () => {
      setupFakeTasks({ tasks: [], listStatus: 500 });
      render();

      expect(
        await screen.findByText(/Não foi possível carregar as tarefas agora/),
      ).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
      expect(screen.getByLabelText('Adicionar uma tarefa para hoje')).toBeInTheDocument();
    });
  });
});
