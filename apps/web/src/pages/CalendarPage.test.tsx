import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarEvent } from '@lifexp/shared';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { setAccessToken } from '@/lib/apiClient';
import { CalendarPage } from './CalendarPage';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast, Toaster: () => null }));

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

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.search}</p>;
}

interface Options {
  desktop?: boolean;
  events?: CalendarEvent[];
  eventsStatus?: number;
  initial?: string;
}

function setup(options: Options = {}) {
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
      if (url.startsWith('/api/areas')) return json(200, []);
      if (url.startsWith('/api/events?')) {
        calls.push({ method, url });
        if (options.eventsStatus) return json(options.eventsStatus, { message: 'falhou' });
        const params = new URL(url, 'http://x').searchParams;
        const [from, to] = [params.get('from')!, params.get('to')!];
        return json(
          200,
          (options.events ?? []).filter((e) => e.date >= from && e.date <= to),
        );
      }
      if (url === '/api/events' && method === 'POST') {
        calls.push({ method, url, body });
        return json(
          201,
          makeEvent(9, { ...(body as object), id: '0192f1a0-7b3c-7000-8000-00000000e099' }),
        );
      }
      return json(404);
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[options.initial ?? '/calendario']}>
        <AuthProvider>
          <CalendarPage />
          <Where />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { calls };
}

const grid = () => screen.findByRole('region', { name: 'Grade do mês' });

describe('CalendarPage (visão mensal, RF34)', () => {
  beforeEach(() => {
    setAccessToken(null);
    toast.success.mockClear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T15:00:00.000Z')); // quarta 12:00 em São Paulo
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('abre no mês atual, com título, dias da semana e a grade completa', async () => {
    setup();
    const section = within(await grid());

    expect(screen.getByRole('heading', { name: 'Outubro de 2026', level: 1 })).toBeInTheDocument();
    for (const name of ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']) {
      expect(section.getByText(name)).toBeInTheDocument();
    }
    // 5 semanas de 7 dias: 28/09 a 01/11
    expect(section.getAllByRole('button', { name: /,\s*\d+ eventos?$/ })).toHaveLength(35);
    expect(
      section.getByRole('button', { name: /quarta-feira, 7 de outubro de 2026 \(hoje\)/ }),
    ).toBeInTheDocument();
  });

  it('busca os eventos de toda a grade (inclui dias dos meses vizinhos)', async () => {
    const { calls } = setup();
    await grid();
    await waitFor(() =>
      expect(calls.map((c) => c.url)).toContain('/api/events?from=2026-09-28&to=2026-11-01'),
    );
  });

  it('mostra os eventos no dia certo (desktop: com hora e título)', async () => {
    setup({
      events: [
        makeEvent(1, { title: 'Consulta', time: '14:30', category: 'medical' }),
        makeEvent(2, { title: 'Aniversário da Bia', date: '2026-10-20', category: 'birthday' }),
      ],
    });
    const section = within(await grid());

    expect(
      await section.findByRole('button', { name: 'Evento: Consulta, 14:30' }),
    ).toHaveTextContent('14:30');
    expect(
      section.getByRole('button', { name: 'Evento: Aniversário da Bia, dia todo' }),
    ).toBeInTheDocument();
    expect(
      section.getByRole('button', {
        name: /quarta-feira, 7 de outubro de 2026 \(hoje\), 1 evento$/,
      }),
    ).toBeInTheDocument();
  });

  it('mais de 2 eventos no dia: mostra 2 e "+N mais"', async () => {
    setup({
      events: [1, 2, 3, 4].map((n) => makeEvent(n, { title: `Ev ${n}`, time: `0${n}:00` })),
    });
    const section = within(await grid());

    await section.findByRole('button', { name: /Evento: Ev 1/ });
    expect(section.getByRole('button', { name: /Evento: Ev 2/ })).toBeInTheDocument();
    expect(section.queryByRole('button', { name: /Evento: Ev 3/ })).not.toBeInTheDocument();
    expect(section.getByRole('button', { name: '+2 mais' })).toBeInTheDocument();
  });

  it('no celular mostra pontos coloridos em vez dos títulos', async () => {
    setup({ desktop: false, events: [makeEvent(1, { title: 'Consulta' })] });
    const section = within(await grid());

    await waitFor(() =>
      expect(
        section.getByRole('button', {
          name: /quarta-feira, 7 de outubro de 2026 \(hoje\), 1 evento$/,
        }),
      ).toBeInTheDocument(),
    );
    expect(section.queryByRole('button', { name: /Evento: Consulta/ })).not.toBeInTheDocument();
    // um ponto por evento (no máximo 4), dentro da célula do dia
    const cell = section.getByRole('button', { name: /\(hoje\), 1 evento$/ }).parentElement!;
    expect(cell.querySelectorAll('span.rounded-full')).toHaveLength(1);
  });

  it('no celular, no máximo 4 pontos por dia', async () => {
    setup({
      desktop: false,
      events: [1, 2, 3, 4, 5, 6].map((n) => makeEvent(n, { title: `Ev ${n}` })),
    });
    const section = within(await grid());

    await waitFor(() =>
      expect(section.getByRole('button', { name: /\(hoje\), 6 eventos$/ })).toBeInTheDocument(),
    );
    const cell = section.getByRole('button', { name: /\(hoje\), 6 eventos$/ }).parentElement!;
    expect(cell.querySelectorAll('span.rounded-full')).toHaveLength(4);
  });

  it('o dia aberto começa em hoje e a lista do dia mostra os eventos dele', async () => {
    setup({ events: [makeEvent(1, { title: 'Consulta', time: '14:30' })] });
    await grid();

    const day = within(await screen.findByRole('region', { name: 'Eventos do dia' }));
    expect(
      day.getByRole('heading', { name: 'Quarta-feira, 7 de outubro de 2026' }),
    ).toBeInTheDocument();
    expect(await day.findByRole('button', { name: /Evento: Consulta/ })).toBeInTheDocument();
  });

  it('escolher outro dia troca a lista; dia vazio explica', async () => {
    setup({ events: [makeEvent(1, { title: 'Viagem', date: '2026-10-09', category: 'trip' })] });
    const section = within(await grid());

    await userEvent.click(
      section.getByRole('button', { name: /sexta-feira, 9 de outubro de 2026/ }),
    );
    const day = within(screen.getByRole('region', { name: 'Eventos do dia' }));
    expect(
      day.getByRole('heading', { name: 'Sexta-feira, 9 de outubro de 2026' }),
    ).toBeInTheDocument();
    expect(await day.findByRole('button', { name: /Evento: Viagem/ })).toBeInTheDocument();

    await userEvent.click(section.getByRole('button', { name: /sábado, 10 de outubro de 2026/ }));
    expect(day.getByText('Nenhum evento neste dia.')).toBeInTheDocument();
  });

  it('o dia escolhido fica marcado (aria-pressed)', async () => {
    setup();
    const section = within(await grid());
    const friday = section.getByRole('button', { name: /sexta-feira, 9 de outubro/ });

    await userEvent.click(friday);

    expect(friday).toHaveAttribute('aria-pressed', 'true');
    expect(section.getByRole('button', { name: /quarta-feira, 7 de outubro/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  describe('navegação entre meses', () => {
    it('avança e volta mês a mês, com o mês na URL, e "Hoje" volta ao atual', async () => {
      setup();
      await grid();

      await userEvent.click(screen.getByRole('button', { name: 'Próximo mês' }));
      expect(await screen.findByRole('heading', { name: 'Novembro de 2026' })).toBeInTheDocument();
      expect(screen.getByTestId('where')).toHaveTextContent('?mes=2026-11');

      await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
      await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
      expect(await screen.findByRole('heading', { name: 'Setembro de 2026' })).toBeInTheDocument();
      expect(screen.getByTestId('where')).toHaveTextContent('?mes=2026-09');

      await userEvent.click(screen.getByRole('button', { name: 'Hoje' }));
      expect(await screen.findByRole('heading', { name: 'Outubro de 2026' })).toBeInTheDocument();
      expect(screen.getByTestId('where')).toBeEmptyDOMElement();
    });

    it('"Hoje" fica desabilitado no mês atual', async () => {
      setup();
      await grid();
      expect(screen.getByRole('button', { name: 'Hoje' })).toBeDisabled();
    });

    it('abre direto no mês da URL, e lixo na URL vira o mês atual', async () => {
      setup({ initial: '/calendario?mes=2027-01' });
      expect(await screen.findByRole('heading', { name: 'Janeiro de 2027' })).toBeInTheDocument();
    });

    it('mês inválido na URL cai no mês atual', async () => {
      setup({ initial: '/calendario?mes=abc' });
      expect(await screen.findByRole('heading', { name: 'Outubro de 2026' })).toBeInTheDocument();
    });

    it('fora do mês atual, o dia aberto é o dia 1 e nenhum dia é "hoje"', async () => {
      setup({ initial: '/calendario?mes=2026-12' });
      const section = within(await grid());

      expect(
        within(await screen.findByRole('region', { name: 'Eventos do dia' })).getByRole('heading', {
          name: 'Terça-feira, 1 de dezembro de 2026',
        }),
      ).toBeInTheDocument();
      expect(section.queryByRole('button', { name: /\(hoje\)/ })).not.toBeInTheDocument();
    });

    it('trocar de mês descarta o dia escolhido no mês anterior', async () => {
      setup();
      const section = within(await grid());
      await userEvent.click(section.getByRole('button', { name: /sexta-feira, 9 de outubro/ }));

      await userEvent.click(screen.getByRole('button', { name: 'Próximo mês' }));

      expect(
        within(await screen.findByRole('region', { name: 'Eventos do dia' })).getByRole('heading', {
          name: 'Domingo, 1 de novembro de 2026',
        }),
      ).toBeInTheDocument();
    });
  });

  describe('criar evento', () => {
    it('"Novo evento" sugere o dia aberto', async () => {
      setup();
      const section = within(await grid());
      await userEvent.click(section.getByRole('button', { name: /sexta-feira, 9 de outubro/ }));

      await userEvent.click(screen.getByRole('button', { name: 'Novo evento neste dia' }));

      expect(within(await screen.findByRole('dialog')).getByLabelText('Data')).toHaveValue(
        '2026-10-09',
      );
    });

    it('cria o evento e a grade o mostra', async () => {
      const { calls } = setup();
      await grid();

      await userEvent.click(screen.getByRole('button', { name: 'Novo evento' }));
      const dialog = within(await screen.findByRole('dialog'));
      await userEvent.type(dialog.getByLabelText('Título'), 'Dentista');
      await userEvent.click(dialog.getByRole('button', { name: 'Criar evento' }));

      await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
      expect(calls.find((c) => c.method === 'POST')!.body).toMatchObject({
        title: 'Dentista',
        date: '2026-10-07',
      });
    });
  });

  it('clicar no evento abre os detalhes', async () => {
    setup({ events: [makeEvent(1, { title: 'Consulta', time: '14:30' })] });
    const section = within(await grid());

    await userEvent.click(await section.findByRole('button', { name: /Evento: Consulta/ }));

    expect(
      within(await screen.findByRole('dialog')).getByRole('heading', { name: 'Consulta' }),
    ).toBeInTheDocument();
  });

  it('erro ao carregar os eventos avisa e oferece tentar de novo, sem esconder a grade', async () => {
    const { calls } = setup({ eventsStatus: 500 });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar os eventos do mês',
    );
    expect(screen.getByRole('region', { name: 'Grade do mês' })).toBeInTheDocument();
    const before = calls.length;
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(calls.length).toBeGreaterThan(before));
  });

  it('tem atalho para a Semana', async () => {
    setup();
    expect(await screen.findByRole('link', { name: 'Semana' })).toHaveAttribute('href', '/semana');
  });
});
