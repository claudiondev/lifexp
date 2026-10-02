import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarEvent } from '@lifexp/shared';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { setAccessToken } from '@/lib/apiClient';
import { WeekPage } from './WeekPage';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast, Toaster: () => null }));

const AREA_ID = '0192f1a0-7b3c-7000-8000-0000000000b1';
const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const makeEvent = (n: number, overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: `0192f1a0-7b3c-7000-8000-00000000e00${n}`,
  areaId: null,
  title: `Evento ${n}`,
  notes: null,
  date: '2026-10-07',
  time: null,
  category: 'appointment',
  remindBeforeMin: 1440,
  ...overrides,
});

interface Options {
  desktop?: boolean;
  events?: CalendarEvent[];
  eventsStatus?: number;
  postStatus?: number;
}

function setup(options: Options = {}) {
  let events = [...(options.events ?? [])];
  const calls: { method: string; url: string; body?: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: options.desktop ?? true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;

      if (url === '/api/auth/refresh') {
        return json(200, {
          user: {
            id: '0192f1a0-7b3c-7000-8000-000000000001',
            name: 'Ana',
            email: 'ana@mail.com',
            timezone: 'America/Sao_Paulo',
            avatarKey: 'swords',
            createdAt: '2026-10-01T12:00:00.000Z',
          },
          accessToken: 't',
        });
      }
      if (url.startsWith('/api/activities')) return json(200, []);
      if (url.startsWith('/api/areas')) {
        return json(200, [
          {
            id: AREA_ID,
            name: 'Saúde',
            color: 'moss',
            icon: 'heart-pulse',
            position: 0,
            archivedAt: null,
          },
        ]);
      }
      if (url.startsWith('/api/blocks/week')) {
        const weekStart = new URL(url, 'http://x').searchParams.get('weekStart');
        return json(200, { weekStart, weekEnd: weekStart, occurrences: [], completions: [] });
      }
      if (url.startsWith('/api/events?')) {
        calls.push({ method, url });
        if (options.eventsStatus) return json(options.eventsStatus, { message: 'falhou' });
        const params = new URL(url, 'http://x').searchParams;
        const [from, to] = [params.get('from')!, params.get('to')!];
        return json(
          200,
          events.filter((e) => e.date >= from && e.date <= to),
        );
      }
      if (url.startsWith('/api/events')) {
        calls.push({ method, url, body });
        if (method === 'POST') {
          if (options.postStatus)
            return json(options.postStatus, { message: 'A área está arquivada' });
          const created = makeEvent(9, {
            ...(body as object),
            id: '0192f1a0-7b3c-7000-8000-00000000e099',
          });
          events = [...events, created];
          return json(201, created);
        }
        const id = url.split('/').pop()!;
        if (method === 'PATCH') {
          events = events.map((e) => (e.id === id ? { ...e, ...(body as object) } : e));
          return json(
            200,
            events.find((e) => e.id === id),
          );
        }
        if (method === 'DELETE') {
          events = events.filter((e) => e.id !== id);
          return new Response(null, { status: 204 });
        }
      }
      return json(404);
    }),
  );

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/semana']}>
        <AuthProvider>
          <WeekPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { calls };
}

const writes = <T extends { method: string }>(calls: T[]): T[] =>
  calls.filter((c) => c.method !== 'GET');

describe('eventos na Semana', () => {
  beforeEach(() => {
    setAccessToken(null);
    toast.success.mockClear();
    toast.error.mockClear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T15:00:00.000Z')); // quarta 12:00 em São Paulo
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('desktop (faixa no topo da grade, RF35)', () => {
    it('mostra os eventos de cada dia numa faixa acima das horas', async () => {
      setup({
        events: [
          makeEvent(1, { title: 'Reunião do condomínio', time: '19:00' }),
          makeEvent(2, { title: 'Aniversário da Bia', date: '2026-10-09', category: 'birthday' }),
        ],
      });

      const strip = await screen.findByRole('group', { name: 'Eventos da semana' });
      expect(
        within(strip).getByRole('button', { name: 'Evento: Reunião do condomínio, 19:00' }),
      ).toBeInTheDocument();
      expect(
        within(strip).getByRole('button', { name: 'Evento: Aniversário da Bia, dia todo' }),
      ).toBeInTheDocument();
    });

    it('não mostra a faixa quando a semana não tem eventos', async () => {
      setup({ events: [] });
      await screen.findByRole('region', { name: /quarta-feira/ });
      expect(screen.queryByRole('group', { name: 'Eventos da semana' })).not.toBeInTheDocument();
    });

    it('só traz eventos da semana exibida', async () => {
      const { calls } = setup({
        events: [makeEvent(1, { title: 'Fora', date: '2026-10-14' })],
      });

      await screen.findByRole('region', { name: /quarta-feira/ });
      await waitFor(() =>
        expect(calls.map((c) => c.url)).toContain('/api/events?from=2026-10-05&to=2026-10-11'),
      );
      expect(screen.queryByText('Fora')).not.toBeInTheDocument();
    });

    it('a grade de blocos continua funcionando se os eventos falharem', async () => {
      setup({ eventsStatus: 500 });

      expect(await screen.findByRole('region', { name: /quarta-feira/ })).toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Eventos da semana' })).not.toBeInTheDocument();
    });

    it('clicar no evento abre os detalhes: dia, horário, lembrete, área e notas', async () => {
      setup({
        events: [
          makeEvent(1, {
            title: 'Consulta',
            time: '14:30',
            category: 'medical',
            areaId: AREA_ID,
            notes: 'Levar exames',
            remindBeforeMin: 60,
          }),
        ],
      });

      await userEvent.click(await screen.findByRole('button', { name: /Evento: Consulta/ }));

      const dialog = within(await screen.findByRole('dialog'));
      expect(dialog.getByRole('heading', { name: 'Consulta' })).toBeInTheDocument();
      expect(dialog.getByText('Quarta-feira, 7 de outubro de 2026')).toBeInTheDocument();
      expect(dialog.getByText('14:30')).toBeInTheDocument();
      expect(dialog.getByText('1 hora antes')).toBeInTheDocument();
      expect(await dialog.findByText('Saúde')).toBeInTheDocument();
      expect(dialog.getByText('Levar exames')).toBeInTheDocument();
    });
  });

  describe('celular (eventos do dia no topo da lista)', () => {
    it('mostra os eventos do dia aberto e troca ao mudar de dia', async () => {
      setup({
        desktop: false,
        events: [
          makeEvent(1, { title: 'Hoje tem consulta', time: '10:00', category: 'medical' }),
          makeEvent(2, { title: 'Sexta tem viagem', date: '2026-10-09', category: 'trip' }),
        ],
      });

      const today = await screen.findByRole('list', { name: 'Eventos do dia' });
      expect(within(today).getByRole('button', { name: /Hoje tem consulta/ })).toBeInTheDocument();
      expect(within(today).queryByText('Sexta tem viagem')).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('tab', { name: /sexta-feira/ }));
      const friday = await screen.findByRole('list', { name: 'Eventos do dia' });
      expect(within(friday).getByRole('button', { name: /Sexta tem viagem/ })).toBeInTheDocument();
    });

    it('dia sem eventos não mostra a lista de eventos', async () => {
      setup({ desktop: false, events: [makeEvent(1, { date: '2026-10-09' })] });
      await screen.findByRole('tab', { name: /quarta-feira/ });
      expect(screen.queryByRole('list', { name: 'Eventos do dia' })).not.toBeInTheDocument();
    });
  });

  describe('criar evento', () => {
    const open = async () => {
      await screen.findByRole('region', { name: /quarta-feira/ });
      await userEvent.click(screen.getByRole('button', { name: 'Novo evento' }));
      return within(await screen.findByRole('dialog'));
    };

    it('abre com os padrões: hoje, dia todo, lembrete de 1 dia antes (RN24)', async () => {
      setup();
      const dialog = await open();

      expect(dialog.getByLabelText('Data')).toHaveValue('2026-10-07');
      expect(dialog.getByRole('switch', { name: 'Dia todo' })).toBeChecked();
      expect(dialog.queryByLabelText('Hora')).not.toBeInTheDocument();
      expect(dialog.getByLabelText('Lembrete')).toHaveValue('1440');
      expect(dialog.getByLabelText('Categoria')).toHaveValue('appointment');
    });

    it('cria um evento de dia todo com exatamente o que a API espera', async () => {
      const { calls } = setup();
      const dialog = await open();

      await userEvent.type(dialog.getByLabelText('Título'), '  Aniversário da Bia ');
      await userEvent.selectOptions(dialog.getByLabelText('Categoria'), 'Aniversário');
      await userEvent.click(dialog.getByRole('button', { name: 'Criar evento' }));

      await waitFor(() => expect(writes(calls)).toHaveLength(1));
      expect(writes(calls)[0]).toEqual({
        method: 'POST',
        url: '/api/events',
        body: {
          title: 'Aniversário da Bia',
          category: 'birthday',
          date: '2026-10-07',
          time: null,
          areaId: null,
          notes: null,
          remindBeforeMin: 1440,
        },
      });
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith('Evento criado', {
          description: 'Aniversário da Bia · 7 de outubro de 2026',
        }),
      );
    });

    it('com hora, área, notas e lembrete próprio', async () => {
      const { calls } = setup();
      const dialog = await open();

      await userEvent.type(dialog.getByLabelText('Título'), 'Consulta');
      await userEvent.click(dialog.getByRole('switch', { name: 'Dia todo' }));
      fireEvent.change(dialog.getByLabelText('Hora'), { target: { value: '14:30' } });
      fireEvent.change(dialog.getByLabelText('Data'), { target: { value: '2026-10-09' } });
      await userEvent.selectOptions(dialog.getByLabelText('Lembrete'), '15 minutos antes');
      await userEvent.selectOptions(await dialog.findByLabelText('Área (opcional)'), 'Saúde');
      await userEvent.type(dialog.getByLabelText('Notas (opcional)'), 'Levar exames');
      await userEvent.click(dialog.getByRole('button', { name: 'Criar evento' }));

      await waitFor(() => expect(writes(calls)).toHaveLength(1));
      expect(writes(calls)[0]!.body).toEqual({
        title: 'Consulta',
        category: 'appointment',
        date: '2026-10-09',
        time: '14:30',
        areaId: AREA_ID,
        notes: 'Levar exames',
        remindBeforeMin: 15,
      });
    });

    it('"Sem lembrete" envia nulo', async () => {
      const { calls } = setup();
      const dialog = await open();

      await userEvent.type(dialog.getByLabelText('Título'), 'Evento');
      await userEvent.selectOptions(dialog.getByLabelText('Lembrete'), 'Sem lembrete');
      await userEvent.click(dialog.getByRole('button', { name: 'Criar evento' }));

      await waitFor(() => expect(writes(calls)).toHaveLength(1));
      expect(writes(calls)[0]!.body).toMatchObject({ remindBeforeMin: null });
    });

    it('dia todo só oferece lembretes em dias; com hora oferece todos', async () => {
      setup();
      const dialog = await open();
      const options = () =>
        dialog
          .getAllByRole('option')
          .filter((o) => /antes|Sem lembrete|No horário/.test(o.textContent ?? ''))
          .map((o) => o.textContent);

      expect(options()).toEqual(['Sem lembrete', '1 dia antes', '2 dias antes']);
      await userEvent.click(dialog.getByRole('switch', { name: 'Dia todo' }));
      expect(options()).toEqual([
        'Sem lembrete',
        'No horário',
        '15 minutos antes',
        '1 hora antes',
        '1 dia antes',
        '2 dias antes',
      ]);
    });

    it('marcar "Dia todo" de novo volta o lembrete em minutos para 1 dia antes', async () => {
      setup();
      const dialog = await open();
      const toggle = dialog.getByRole('switch', { name: 'Dia todo' });

      await userEvent.click(toggle);
      await userEvent.selectOptions(dialog.getByLabelText('Lembrete'), '15 minutos antes');
      await userEvent.click(toggle);

      expect(dialog.getByLabelText('Lembrete')).toHaveValue('1440');
    });

    it('exige o título e não chama a API', async () => {
      const { calls } = setup();
      const dialog = await open();

      await userEvent.click(dialog.getByRole('button', { name: 'Criar evento' }));

      expect(await dialog.findByText('Informe o título do evento')).toBeInTheDocument();
      expect(writes(calls)).toHaveLength(0);
    });

    it('mostra o erro do servidor e mantém o diálogo aberto', async () => {
      setup({ postStatus: 409 });
      const dialog = await open();

      await userEvent.type(dialog.getByLabelText('Título'), 'Evento');
      await userEvent.click(dialog.getByRole('button', { name: 'Criar evento' }));

      expect(await dialog.findByRole('alert')).toHaveTextContent('A área está arquivada');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('no celular, sugere o dia que está aberto', async () => {
      setup({ desktop: false });
      await userEvent.click(await screen.findByRole('tab', { name: /sexta-feira/ }));
      await userEvent.click(screen.getByRole('button', { name: 'Novo evento' }));

      expect(within(await screen.findByRole('dialog')).getByLabelText('Data')).toHaveValue(
        '2026-10-09',
      );
    });
  });

  describe('editar e excluir', () => {
    it('edita pelo painel, com os campos preenchidos, e envia o evento completo', async () => {
      const { calls } = setup({
        events: [
          makeEvent(1, {
            title: 'Consulta',
            time: '14:30',
            category: 'medical',
            remindBeforeMin: 60,
          }),
        ],
      });

      await userEvent.click(await screen.findByRole('button', { name: /Evento: Consulta/ }));
      await userEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: 'Editar' }),
      );

      const dialog = within(await screen.findByRole('dialog'));
      expect(dialog.getByLabelText('Título')).toHaveValue('Consulta');
      expect(dialog.getByRole('switch', { name: 'Dia todo' })).not.toBeChecked();
      expect(dialog.getByLabelText('Hora')).toHaveValue('14:30');
      expect(dialog.getByLabelText('Lembrete')).toHaveValue('60');
      await userEvent.clear(dialog.getByLabelText('Título'));
      await userEvent.type(dialog.getByLabelText('Título'), 'Retorno');
      await userEvent.click(dialog.getByRole('button', { name: 'Salvar' }));

      await waitFor(() => expect(writes(calls)).toHaveLength(1));
      expect(writes(calls)[0]).toMatchObject({
        method: 'PATCH',
        url: '/api/events/0192f1a0-7b3c-7000-8000-00000000e001',
        body: { title: 'Retorno', time: '14:30', remindBeforeMin: 60, category: 'medical' },
      });
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith('Evento atualizado', expect.anything()),
      );
    });

    it('o formulário de edição usa a data do evento, não a do dia aberto', async () => {
      setup({ events: [makeEvent(1, { title: 'Viagem', date: '2026-10-09', category: 'trip' })] });

      await userEvent.click(await screen.findByRole('button', { name: /Evento: Viagem/ }));
      await userEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: 'Editar' }),
      );

      expect(within(await screen.findByRole('dialog')).getByLabelText('Data')).toHaveValue(
        '2026-10-09',
      );
    });

    it('evento sem lembrete abre a edição com "Sem lembrete" e mantém nulo', async () => {
      const { calls } = setup({
        events: [makeEvent(1, { title: 'Consulta', remindBeforeMin: null })],
      });

      await userEvent.click(await screen.findByRole('button', { name: /Evento: Consulta/ }));
      await userEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: 'Editar' }),
      );
      const dialog = within(await screen.findByRole('dialog'));
      expect(dialog.getByLabelText('Lembrete')).toHaveValue('none');
      await userEvent.click(dialog.getByRole('button', { name: 'Salvar' }));

      await waitFor(() => expect(writes(calls)).toHaveLength(1));
      expect(writes(calls)[0]!.body).toMatchObject({ remindBeforeMin: null });
    });

    it('editar fecha o painel de detalhes: fica um único diálogo aberto', async () => {
      setup({ events: [makeEvent(1, { title: 'Consulta' })] });

      await userEvent.click(await screen.findByRole('button', { name: /Evento: Consulta/ }));
      await userEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: 'Editar' }),
      );

      await screen.findByText('Editar evento');
      expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    });

    it('sem hora no cartão do evento de dia todo; com hora, mostra a hora', async () => {
      setup({
        events: [
          makeEvent(1, { title: 'Com hora', time: '19:00' }),
          makeEvent(2, { title: 'Sem hora', date: '2026-10-08' }),
        ],
      });

      const timed = await screen.findByRole('button', { name: /Evento: Com hora/ });
      expect(timed).toHaveTextContent('19:00');
      expect(screen.getByRole('button', { name: /Evento: Sem hora/ })).not.toHaveTextContent(
        /\d\d:\d\d/,
      );
    });

    it('tornar o evento "dia todo" na edição envia hora nula', async () => {
      const { calls } = setup({
        events: [makeEvent(1, { title: 'Consulta', time: '14:30', remindBeforeMin: 1440 })],
      });

      await userEvent.click(await screen.findByRole('button', { name: /Evento: Consulta/ }));
      await userEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: 'Editar' }),
      );
      const dialog = within(await screen.findByRole('dialog'));
      await userEvent.click(dialog.getByRole('switch', { name: 'Dia todo' }));
      await userEvent.click(dialog.getByRole('button', { name: 'Salvar' }));

      await waitFor(() => expect(writes(calls)).toHaveLength(1));
      expect(writes(calls)[0]!.body).toMatchObject({ time: null });
    });

    it('excluir pede confirmação e depois remove', async () => {
      const { calls } = setup({ events: [makeEvent(1, { title: 'Consulta' })] });

      await userEvent.click(await screen.findByRole('button', { name: /Evento: Consulta/ }));
      await userEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: 'Excluir' }),
      );
      expect(writes(calls)).toHaveLength(0);

      const confirm = within(await screen.findByRole('region', { name: 'Confirmar exclusão' }));
      await userEvent.click(confirm.getByRole('button', { name: 'Excluir evento' }));

      await waitFor(() => expect(writes(calls)).toHaveLength(1));
      expect(writes(calls)[0]).toMatchObject({
        method: 'DELETE',
        url: '/api/events/0192f1a0-7b3c-7000-8000-00000000e001',
      });
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Evento “Consulta” excluído'));
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: /Evento: Consulta/ })).not.toBeInTheDocument(),
      );
    });

    it('cancelar a exclusão não chama a API', async () => {
      const { calls } = setup({ events: [makeEvent(1, { title: 'Consulta' })] });

      await userEvent.click(await screen.findByRole('button', { name: /Evento: Consulta/ }));
      await userEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: 'Excluir' }),
      );
      await userEvent.click(
        within(await screen.findByRole('region', { name: 'Confirmar exclusão' })).getByRole(
          'button',
          { name: 'Cancelar' },
        ),
      );

      expect(writes(calls)).toHaveLength(0);
      expect(screen.getByRole('button', { name: 'Excluir' })).toBeInTheDocument();
    });
  });

  it('há um atalho para o calendário do mês', async () => {
    setup();
    expect(await screen.findByRole('link', { name: 'Calendário do mês' })).toHaveAttribute(
      'href',
      '/calendario',
    );
  });
});
