import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/lib/apiClient';
import { makeGoal } from '../goals/testing';
import { BlockFormDialog } from './BlockFormDialog';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast, Toaster: () => null }));

const AREA_WORK = '0192f1a0-7b3c-7000-8000-0000000000b1';
const AREA_HEALTH = '0192f1a0-7b3c-7000-8000-0000000000b2';
const ACT_MEETING = '0192f1a0-7b3c-7000-8000-0000000000a1';
const ACT_RUN = '0192f1a0-7b3c-7000-8000-0000000000a2';

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

interface Options {
  goals?: unknown[];
  activities?: unknown[];
  postResponse?: () => Response;
  weeklyResponse?: () => Response;
}

const defaultActivities = [
  { id: ACT_MEETING, areaId: AREA_WORK, name: 'Reunião', xpWeight: 1, archivedAt: null },
  { id: ACT_RUN, areaId: AREA_HEALTH, name: 'Corrida', xpWeight: 1.5, archivedAt: null },
];

function setup(options: Options = {}) {
  const posts: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === '/api/goals') return json(200, options.goals ?? []);
      if (url.startsWith('/api/activities'))
        return json(200, options.activities ?? defaultActivities);
      if (url.startsWith('/api/areas')) {
        return json(200, [
          {
            id: AREA_WORK,
            name: 'Trabalho',
            color: 'violet',
            icon: 'briefcase',
            position: 0,
            archivedAt: null,
          },
          {
            id: AREA_HEALTH,
            name: 'Saúde',
            color: 'moss',
            icon: 'heart-pulse',
            position: 1,
            archivedAt: null,
          },
        ]);
      }
      if (url === '/api/blocks' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        posts.push(body);
        // A API devolve o bloco completo; o cliente valida a resposta com o mesmo schema.
        return (
          options.postResponse?.() ??
          json(201, {
            id: '0192f1a0-7b3c-7000-8000-0000000000c1',
            activityId: body.activityId,
            recurrence: body.recurrence,
            weekday: body.weekday ?? null,
            date: body.date ?? null,
            startTime: body.startTime,
            durationMin: body.durationMin,
            validFrom: body.validFrom ?? null,
            validUntil: null,
            goalId: null,
          })
        );
      }
      if (url === '/api/blocks/weekly' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        posts.push(body);
        return (
          options.weeklyResponse?.() ??
          json(
            201,
            (body.weekdays as number[]).map((weekday, index) => ({
              id: `0192f1a0-7b3c-7000-8000-00000000c10${index}`,
              activityId: body.activityId,
              recurrence: 'weekly',
              weekday,
              date: null,
              startTime: body.startTime,
              durationMin: body.durationMin,
              validFrom: body.validFrom,
              validUntil: body.validUntil ?? null,
              goalId: body.goalId ?? null,
            })),
          )
        );
      }
      return json(404);
    }),
  );

  const onOpenChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <BlockFormDialog
          open
          onOpenChange={onOpenChange}
          weekStart="2026-10-05"
          today="2026-10-07"
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { posts, onOpenChange };
}

/** Espera as atividades chegarem da API (o select aparece antes das opções). */
const activitiesLoaded = () => screen.findByRole('option', { name: 'Reunião' });
const choose = async (label: string) => {
  await activitiesLoaded();
  await userEvent.selectOptions(screen.getByLabelText('Atividade'), label);
};
const submit = () => userEvent.click(screen.getByRole('button', { name: 'Criar bloco' }));
const day = (name: string) => screen.getByRole('checkbox', { name });
const checkedDays = () =>
  screen
    .getAllByRole('checkbox')
    .filter((box) => (box as HTMLInputElement).checked)
    .map((box) => box.getAttribute('aria-label'));

describe('BlockFormDialog', () => {
  beforeEach(() => {
    setAccessToken('token');
    toast.success.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('abre com os padrões: toda semana, no dia de hoje, 09:00, 1 h', async () => {
    setup();
    await screen.findByLabelText('Atividade');

    expect(screen.getByRole('radio', { name: 'Toda semana' })).toBeChecked();
    expect(checkedDays()).toEqual(['Quarta-feira']); // hoje é quarta
    expect(screen.getByRole('radio', { name: 'Sem fim' })).toBeChecked();
    expect(screen.getByLabelText('A partir de')).toHaveValue('2026-10-07');
    expect(screen.getByLabelText('Início')).toHaveValue('09:00');
    expect(screen.getByLabelText('Duração')).toHaveValue('60');
    expect(screen.getByTestId('block-summary')).toHaveTextContent(
      'Toda quarta-feira, das 09:00 às 10:00. Começa em 7 de outubro de 2026. Sem data para terminar.',
    );
  });

  describe('meta do bloco (RF19)', () => {
    const GOAL_ID = '0192f1a0-7b3c-7000-8000-0000000000c1';
    const goals = [
      makeGoal({ id: GOAL_ID, title: 'Ler 12 livros' }),
      makeGoal({
        id: '0192f1a0-7b3c-7000-8000-0000000000c2',
        title: 'Meta pausada',
        status: 'paused',
      }),
      makeGoal({
        id: '0192f1a0-7b3c-7000-8000-0000000000c3',
        title: 'Meta concluída',
        status: 'completed',
      }),
      makeGoal({
        id: '0192f1a0-7b3c-7000-8000-0000000000c4',
        title: 'Meta abandonada',
        status: 'abandoned',
      }),
    ];

    it('sem nenhuma meta, o campo nem aparece', async () => {
      setup({ goals: [] });
      await activitiesLoaded();
      expect(screen.queryByLabelText('Meta (opcional)')).not.toBeInTheDocument();
    });

    it('oferece só metas ativas e pausadas, mais "Sem meta"', async () => {
      setup({ goals });
      const select = await screen.findByLabelText('Meta (opcional)');

      const labels = within(select)
        .getAllByRole('option')
        .map((option) => option.textContent);
      expect(labels).toEqual(['Sem meta', 'Ler 12 livros', 'Meta pausada']);
    });

    it('cria o bloco ligado à meta escolhida', async () => {
      const { posts } = setup({ goals });
      await choose('Reunião');
      await userEvent.selectOptions(
        await screen.findByLabelText('Meta (opcional)'),
        'Ler 12 livros',
      );
      await submit();

      await waitFor(() => expect(posts).toHaveLength(1));
      expect(posts[0]).toMatchObject({ activityId: ACT_MEETING, goalId: GOAL_ID });
    });

    it('sem escolher meta, não envia goalId', async () => {
      const { posts } = setup({ goals });
      await choose('Reunião');
      await screen.findByLabelText('Meta (opcional)');
      await submit();

      await waitFor(() => expect(posts).toHaveLength(1));
      expect(posts[0]).not.toHaveProperty('goalId');
    });
  });

  it('agrupa as atividades pela área', async () => {
    setup();
    await activitiesLoaded();
    const groups = Array.from(document.querySelectorAll('optgroup')).map((group) => group.label);
    expect(groups).toEqual(['Trabalho', 'Saúde']);
  });

  it('cria um bloco semanal com exatamente o que a API espera', async () => {
    const { posts, onOpenChange } = setup();
    await choose('Reunião');

    await userEvent.click(day('Quarta-feira'));
    await userEvent.click(day('Sexta-feira'));
    await userEvent.selectOptions(screen.getByLabelText('Duração'), '1 h 30 min');
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '14:30' } });
    await submit();

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({
      activityId: ACT_MEETING,
      weekdays: [5],
      startTime: '14:30',
      durationMin: 90,
      validFrom: '2026-10-09', // a sexta da semana que está na tela
    });
    // o aviso e o fechamento acontecem depois da resposta da API
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Bloco criado', {
        description: 'Começa em 9 de outubro de 2026.',
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('a data de início acompanha o dia da semana escolhido', async () => {
    setup();
    await screen.findByLabelText('Atividade');

    await userEvent.click(day('Segunda-feira'));
    await userEvent.click(day('Quarta-feira'));
    expect(screen.getByLabelText('A partir de')).toHaveValue('2026-10-05');
    await userEvent.click(day('Domingo'));
    await userEvent.click(day('Segunda-feira'));
    expect(screen.getByLabelText('A partir de')).toHaveValue('2026-10-11');
  });

  it('com vários dias, a data de início acompanha o primeiro deles', async () => {
    setup();
    await screen.findByLabelText('Atividade');

    await userEvent.click(day('Sexta-feira'));
    expect(screen.getByLabelText('A partir de')).toHaveValue('2026-10-07'); // quarta é a mais cedo
    await userEvent.click(day('Terça-feira'));
    expect(screen.getByLabelText('A partir de')).toHaveValue('2026-10-06');
  });

  it('depois que a pessoa escolhe uma data própria, trocar o dia não a sobrescreve', async () => {
    setup();
    await screen.findByLabelText('Atividade');

    fireEvent.change(screen.getByLabelText('A partir de'), { target: { value: '2026-11-02' } });
    await userEvent.click(day('Quarta-feira'));
    await userEvent.click(day('Sexta-feira'));

    expect(screen.getByLabelText('A partir de')).toHaveValue('2026-11-02');
    expect(screen.getByTestId('block-summary')).toHaveTextContent(
      'Começa em 6 de novembro de 2026.',
    );
  });

  it('cria um bloco avulso, sem weekday nem validFrom', async () => {
    const { posts } = setup();
    await choose('Corrida');

    await userEvent.click(screen.getByRole('radio', { name: 'Só uma vez' }));
    expect(screen.queryByRole('checkbox', { name: 'Quarta-feira' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Sem fim' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-10-12' } });
    await submit();

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({
      recurrence: 'once',
      activityId: ACT_RUN,
      date: '2026-10-12',
      startTime: '09:00',
      durationMin: 60,
    });
  });

  it('exige escolher a atividade, sem chamar a API', async () => {
    const { posts } = setup();
    await activitiesLoaded();

    await submit();

    // o erro é um <span>; a opção em branco do select tem o mesmo texto
    expect(
      await screen.findByText('Escolha uma atividade', { selector: 'span' }),
    ).toBeInTheDocument();
    expect(posts).toHaveLength(0);
  });

  it('avisa e bloqueia o bloco que atravessaria a meia-noite', async () => {
    const { posts } = setup();
    await choose('Reunião');

    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '23:30' } });

    expect(
      await screen.findByText('O bloco não pode atravessar a meia-noite.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('block-summary')).not.toHaveTextContent('às 00:30');
    await submit();
    expect(posts).toHaveLength(0);
  });

  it('aceita terminar exatamente à meia-noite', async () => {
    const { posts } = setup();
    await choose('Reunião');

    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '23:00' } });
    await submit();

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(screen.getByTestId('block-summary')).toHaveTextContent('das 23:00 às 24:00');
  });

  it('mostra o erro do servidor e mantém o diálogo aberto (bloco avulso)', async () => {
    const { onOpenChange } = setup({
      postResponse: () =>
        json(409, {
          message: 'A atividade está arquivada. Restaure a atividade e a área primeiro',
        }),
    });
    await choose('Reunião');
    await userEvent.click(screen.getByRole('radio', { name: 'Só uma vez' }));
    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('A atividade está arquivada');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('sem atividades ativas, explica e leva para Áreas', async () => {
    setup({ activities: [] });

    // sob carga (suíte inteira em paralelo) o formulário demora mais que 1 s para montar
    expect(
      await screen.findByText(/Você ainda não tem atividades ativas/, {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Crie uma em Áreas' })).toHaveAttribute(
      'href',
      '/areas',
    );
    expect(screen.getByRole('button', { name: 'Criar bloco' })).toBeDisabled();
  });

  it('em uma semana que não é a atual, parte da segunda-feira da semana exibida', async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input) => {
        const url = String(input);
        if (url.startsWith('/api/activities')) return json(200, defaultActivities);
        return json(200, []);
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <BlockFormDialog open onOpenChange={vi.fn()} weekStart="2026-10-19" today="2026-10-07" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByLabelText('Atividade');
    expect(checkedDays()).toEqual(['Segunda-feira']);
    expect(screen.getByLabelText('A partir de')).toHaveValue('2026-10-19');
  });

  describe('vários dias da semana', () => {
    it('marca e desmarca dias, e o resumo acompanha', async () => {
      setup();
      await screen.findByLabelText('Atividade');

      await userEvent.click(day('Segunda-feira'));
      await userEvent.click(day('Sexta-feira'));
      expect(checkedDays()).toEqual(['Segunda-feira', 'Quarta-feira', 'Sexta-feira']);
      expect(screen.getByTestId('block-summary')).toHaveTextContent(
        'Toda semana: segunda, quarta e sexta, das 09:00 às 10:00.',
      );

      await userEvent.click(day('Quarta-feira'));
      expect(checkedDays()).toEqual(['Segunda-feira', 'Sexta-feira']);
    });

    it('"Dias úteis" e "Todos os dias" marcam os dias de uma vez', async () => {
      setup();
      await screen.findByLabelText('Atividade');

      await userEvent.click(screen.getByRole('button', { name: 'Dias úteis' }));
      expect(checkedDays()).toEqual([
        'Segunda-feira',
        'Terça-feira',
        'Quarta-feira',
        'Quinta-feira',
        'Sexta-feira',
      ]);
      expect(screen.getByTestId('block-summary')).toHaveTextContent(
        'De segunda a sexta, das 09:00',
      );

      await userEvent.click(screen.getByRole('button', { name: 'Todos os dias' }));
      expect(checkedDays()).toHaveLength(7);
      expect(screen.getByTestId('block-summary')).toHaveTextContent('Todos os dias, das 09:00');
    });

    it('cria um bloco por dia marcado numa única chamada e avisa quantos', async () => {
      const { posts, onOpenChange } = setup();
      await choose('Reunião');

      await userEvent.click(screen.getByRole('button', { name: 'Dias úteis' }));
      await submit();

      await waitFor(() => expect(posts).toHaveLength(1));
      expect(posts[0]).toEqual({
        activityId: ACT_MEETING,
        weekdays: [1, 2, 3, 4, 5],
        startTime: '09:00',
        durationMin: 60,
        validFrom: '2026-10-05',
      });
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith('5 blocos criados', {
          description: 'Começa em 5 de outubro de 2026.',
        }),
      );
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('com a meta escolhida, ela vai junto para todos os dias', async () => {
      const goalId = '0192f1a0-7b3c-7000-8000-0000000000c1';
      const { posts } = setup({ goals: [makeGoal({ id: goalId, title: 'Ler 12 livros' })] });
      await choose('Reunião');
      await userEvent.selectOptions(
        await screen.findByLabelText('Meta (opcional)'),
        'Ler 12 livros',
      );
      await userEvent.click(day('Sexta-feira'));
      await submit();

      await waitFor(() => expect(posts).toHaveLength(1));
      expect(posts[0]).toMatchObject({ weekdays: [3, 5], goalId });
    });

    it('sem nenhum dia marcado, avisa e não chama a API', async () => {
      const { posts } = setup();
      await choose('Reunião');

      await userEvent.click(day('Quarta-feira'));
      expect(screen.getByTestId('block-summary')).toHaveTextContent('Escolha ao menos um dia');
      await submit();

      expect(await screen.findByText('Escolha ao menos um dia da semana')).toBeInTheDocument();
      expect(posts).toHaveLength(0);
      // o aviso some assim que um dia volta a ser marcado
      await userEvent.click(day('Quinta-feira'));
      await waitFor(() =>
        expect(screen.queryByText('Escolha ao menos um dia da semana')).not.toBeInTheDocument(),
      );
    });

    it('o horário e a duração valem para todos os dias', async () => {
      const { posts } = setup();
      await choose('Corrida');

      await userEvent.click(day('Segunda-feira'));
      fireEvent.change(screen.getByLabelText('Início'), { target: { value: '18:30' } });
      await userEvent.selectOptions(screen.getByLabelText('Duração'), '45 min');
      await submit();

      await waitFor(() => expect(posts).toHaveLength(1));
      expect(posts[0]).toMatchObject({ weekdays: [1, 3], startTime: '18:30', durationMin: 45 });
    });
  });

  describe('término da série', () => {
    it('"Sem fim" não envia validUntil', async () => {
      const { posts } = setup();
      await choose('Reunião');
      await submit();
      await waitFor(() => expect(posts).toHaveLength(1));
      expect(posts[0]).not.toHaveProperty('validUntil');
    });

    it('"Até uma data" envia a data final e a mostra no resumo e no aviso', async () => {
      const { posts } = setup();
      await choose('Reunião');

      await userEvent.click(screen.getByRole('radio', { name: 'Até uma data' }));
      fireEvent.change(screen.getByLabelText('Último dia'), { target: { value: '2026-11-25' } });
      expect(screen.getByTestId('block-summary')).toHaveTextContent(
        'Termina em 25 de novembro de 2026.',
      );
      await submit();

      await waitFor(() => expect(posts).toHaveLength(1));
      expect(posts[0]).toMatchObject({ validFrom: '2026-10-07', validUntil: '2026-11-25' });
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith('Bloco criado', {
          description: 'Começa em 7 de outubro de 2026. Termina em 25 de novembro de 2026.',
        }),
      );
    });

    it('"Por semanas" converte N semanas na data final, contando o dia de início', async () => {
      const { posts } = setup();
      await choose('Reunião');

      await userEvent.click(screen.getByRole('radio', { name: 'Por semanas' }));
      expect(screen.getByLabelText('Quantas semanas')).toHaveValue(8);
      fireEvent.change(screen.getByLabelText('Quantas semanas'), { target: { value: '4' } });
      // 4 semanas a partir de quarta 7/10 terminam na terça 3/11 (28 dias corridos)
      expect(screen.getByTestId('block-summary')).toHaveTextContent(
        'Termina em 3 de novembro de 2026.',
      );
      await submit();

      await waitFor(() => expect(posts).toHaveLength(1));
      expect(posts[0]).toMatchObject({ validFrom: '2026-10-07', validUntil: '2026-11-03' });
    });

    it('o fim por semanas acompanha a data de início quando ela muda', async () => {
      const { posts } = setup();
      await choose('Reunião');

      await userEvent.click(screen.getByRole('radio', { name: 'Por semanas' }));
      fireEvent.change(screen.getByLabelText('Quantas semanas'), { target: { value: '1' } });
      fireEvent.change(screen.getByLabelText('A partir de'), { target: { value: '2026-12-30' } });
      await submit();

      await waitFor(() => expect(posts).toHaveLength(1));
      expect(posts[0]).toMatchObject({ validFrom: '2026-12-30', validUntil: '2027-01-05' });
    });

    it.each([['0'], ['105'], ['2.5'], ['']])(
      '"Por semanas" com %s é recusado sem chamar a API',
      async (value) => {
        const { posts } = setup();
        await choose('Reunião');

        await userEvent.click(screen.getByRole('radio', { name: 'Por semanas' }));
        fireEvent.change(screen.getByLabelText('Quantas semanas'), { target: { value } });
        await submit();

        expect(await screen.findByText('Informe de 1 a 104 semanas')).toBeInTheDocument();
        expect(posts).toHaveLength(0);
      },
    );

    it('aceita os limites de 1 e de 104 semanas', async () => {
      for (const weeks of ['1', '104']) {
        const { posts } = setup();
        await choose('Reunião');
        await userEvent.click(screen.getByRole('radio', { name: 'Por semanas' }));
        fireEvent.change(screen.getByLabelText('Quantas semanas'), { target: { value: weeks } });
        await submit();
        await waitFor(() => expect(posts).toHaveLength(1));
        cleanup();
      }
    });

    it('data final antes do início é recusada, com o motivo, sem chamar a API', async () => {
      const { posts } = setup();
      await choose('Reunião');

      await userEvent.click(screen.getByRole('radio', { name: 'Até uma data' }));
      fireEvent.change(screen.getByLabelText('Último dia'), { target: { value: '2026-10-01' } });
      await submit();

      expect(
        await screen.findByText('O fim não pode ser antes do primeiro dia do bloco'),
      ).toBeInTheDocument();
      expect(posts).toHaveLength(0);
    });

    it('data final sem preencher é recusada', async () => {
      const { posts } = setup();
      await choose('Reunião');

      await userEvent.click(screen.getByRole('radio', { name: 'Até uma data' }));
      fireEvent.change(screen.getByLabelText('Último dia'), { target: { value: '' } });
      await submit();

      expect(await screen.findByText('Informe a data final')).toBeInTheDocument();
      expect(posts).toHaveLength(0);
    });

    it('data final que deixa um dia marcado sem nenhuma ocorrência é recusada', async () => {
      const { posts } = setup();
      await choose('Reunião');

      await userEvent.click(screen.getByRole('button', { name: 'Dias úteis' }));
      await userEvent.click(screen.getByRole('radio', { name: 'Até uma data' }));
      // a série começa na segunda 5/10 e termina na terça 6/10: quarta a sexta nunca ocorrem
      fireEvent.change(screen.getByLabelText('Último dia'), { target: { value: '2026-10-06' } });
      await submit();

      expect(
        await screen.findByText(
          'O período termina antes da primeira ocorrência de algum dia marcado',
        ),
      ).toBeInTheDocument();
      expect(posts).toHaveLength(0);
    });

    it('"Sem fim" de novo esconde os campos de término e deixa de enviar o fim', async () => {
      const { posts } = setup();
      await choose('Reunião');

      await userEvent.click(screen.getByRole('radio', { name: 'Até uma data' }));
      expect(screen.getByLabelText('Último dia')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('radio', { name: 'Sem fim' }));
      expect(screen.queryByLabelText('Último dia')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Quantas semanas')).not.toBeInTheDocument();
      await submit();

      await waitFor(() => expect(posts).toHaveLength(1));
      expect(posts[0]).not.toHaveProperty('validUntil');
    });

    it('mostra o erro do servidor e mantém o diálogo aberto também na criação em vários dias', async () => {
      const { onOpenChange } = setup({
        weeklyResponse: () => json(409, { message: 'A atividade está arquivada.' }),
      });
      await choose('Reunião');
      await userEvent.click(day('Sexta-feira'));
      await submit();

      expect(await screen.findByRole('alert')).toHaveTextContent('A atividade está arquivada');
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
      expect(toast.success).not.toHaveBeenCalled();
    });
  });

  it('bloco avulso não mostra dias nem término', async () => {
    setup();
    await screen.findByLabelText('Atividade');
    await userEvent.click(screen.getByRole('radio', { name: 'Só uma vez' }));
    expect(screen.queryByRole('button', { name: 'Dias úteis' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Por semanas' })).not.toBeInTheDocument();
    expect(screen.getByTestId('block-summary')).not.toHaveTextContent('Sem data para terminar');
  });
});

describe('BlockFormDialog: anotação', () => {
  beforeEach(() => {
    setAccessToken('token');
    toast.success.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  const typeNote = (text: string) =>
    userEvent.type(screen.getByLabelText('Anotação (opcional)'), text);

  it('o campo começa vazio, é opcional e mostra o contador', async () => {
    setup();
    await activitiesLoaded();

    expect(screen.getByLabelText('Anotação (opcional)')).toHaveValue('');
    expect(screen.getByText('0/500')).toBeInTheDocument();
    expect(screen.getByLabelText('Anotação (opcional)')).toHaveAttribute('maxlength', '500');
  });

  it('o contador acompanha o que a pessoa digita', async () => {
    setup();
    await activitiesLoaded();
    await typeNote('Aula');

    expect(screen.getByText('4/500')).toBeInTheDocument();
  });

  it('bloco semanal: envia a anotação digitada', async () => {
    const { posts } = setup();
    await choose('Reunião');
    await typeNote('Aula de inglês');
    await submit();

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ activityId: ACT_MEETING, note: 'Aula de inglês' });
  });

  it('bloco avulso: envia a anotação digitada', async () => {
    const { posts } = setup();
    await choose('Corrida');
    await userEvent.click(screen.getByRole('radio', { name: 'Só uma vez' }));
    await typeNote('Levar o documento');
    await submit();

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ recurrence: 'once', note: 'Levar o documento' });
  });

  it('sem anotação (ou só espaços), não envia o campo', async () => {
    const { posts } = setup();
    await choose('Reunião');
    await typeNote('   ');
    await submit();

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).not.toHaveProperty('note');
  });

  it('com vários dias marcados, a anotação vale para todos (uma única chamada)', async () => {
    const { posts } = setup();
    await choose('Reunião');
    await userEvent.click(day('Sexta-feira'));
    await typeNote('Treino de pernas');
    await submit();

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ weekdays: [3, 5], note: 'Treino de pernas' });
  });
});
