import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/lib/apiClient';
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
  activities?: unknown[];
  postResponse?: () => Response;
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
          })
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
    expect(screen.getByLabelText('Dia da semana')).toHaveValue('3'); // hoje é quarta
    expect(screen.getByLabelText('A partir de')).toHaveValue('2026-10-07');
    expect(screen.getByLabelText('Início')).toHaveValue('09:00');
    expect(screen.getByLabelText('Duração')).toHaveValue('60');
    expect(screen.getByTestId('block-summary')).toHaveTextContent(
      'Toda quarta-feira, das 09:00 às 10:00. Começa em 7 de outubro de 2026.',
    );
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

    await userEvent.selectOptions(screen.getByLabelText('Dia da semana'), 'Sexta-feira');
    await userEvent.selectOptions(screen.getByLabelText('Duração'), '1 h 30 min');
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '14:30' } });
    await submit();

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({
      recurrence: 'weekly',
      activityId: ACT_MEETING,
      weekday: 5,
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

    await userEvent.selectOptions(screen.getByLabelText('Dia da semana'), 'Segunda-feira');
    expect(screen.getByLabelText('A partir de')).toHaveValue('2026-10-05');
    await userEvent.selectOptions(screen.getByLabelText('Dia da semana'), 'Domingo');
    expect(screen.getByLabelText('A partir de')).toHaveValue('2026-10-11');
  });

  it('depois que a pessoa escolhe uma data própria, trocar o dia não a sobrescreve', async () => {
    setup();
    await screen.findByLabelText('Atividade');

    fireEvent.change(screen.getByLabelText('A partir de'), { target: { value: '2026-11-02' } });
    await userEvent.selectOptions(screen.getByLabelText('Dia da semana'), 'Sexta-feira');

    expect(screen.getByLabelText('A partir de')).toHaveValue('2026-11-02');
    expect(screen.getByTestId('block-summary')).toHaveTextContent(
      'Começa em 6 de novembro de 2026.',
    );
  });

  it('cria um bloco avulso, sem weekday nem validFrom', async () => {
    const { posts } = setup();
    await choose('Corrida');

    await userEvent.click(screen.getByRole('radio', { name: 'Só uma vez' }));
    expect(screen.queryByLabelText('Dia da semana')).not.toBeInTheDocument();
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

  it('mostra o erro do servidor e mantém o diálogo aberto', async () => {
    const { onOpenChange } = setup({
      postResponse: () =>
        json(409, {
          message: 'A atividade está arquivada. Restaure a atividade e a área primeiro',
        }),
    });
    await choose('Reunião');
    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('A atividade está arquivada');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('sem atividades ativas, explica e leva para Áreas', async () => {
    setup({ activities: [] });

    expect(await screen.findByText(/Você ainda não tem atividades ativas/)).toBeInTheDocument();
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

    expect(await screen.findByLabelText('Dia da semana')).toHaveValue('1');
    expect(screen.getByLabelText('A partir de')).toHaveValue('2026-10-19');
  });
});
