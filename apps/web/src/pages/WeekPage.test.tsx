import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { weekStartOf, type Occurrence } from '@lifexp/shared';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { setAccessToken } from '@/lib/apiClient';
import { WeekPage } from './WeekPage';

const AREA_ID = '0192f1a0-7b3c-7000-8000-0000000000b1';
const ACTIVITY_ID = '0192f1a0-7b3c-7000-8000-0000000000a1';
const OTHER_ACTIVITY_ID = '0192f1a0-7b3c-7000-8000-0000000000a2';

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const user = (timezone = 'America/Sao_Paulo') => ({
  id: '0192f1a0-7b3c-7000-8000-000000000001',
  name: 'Ana',
  email: 'ana@mail.com',
  timezone,
  avatarKey: 'swords',
  createdAt: '2026-10-01T12:00:00.000Z',
});

const occurrence = (overrides: Partial<Occurrence> = {}): Occurrence => ({
  blockId: '0192f1a0-7b3c-7000-8000-0000000000c1',
  occurrenceDate: '2026-10-07',
  date: '2026-10-07',
  startTime: '09:00',
  durationMin: 60,
  activityId: ACTIVITY_ID,
  areaId: AREA_ID,
  goalId: null,
  recurrence: 'weekly',
  skipped: false,
  modified: false,
  ...overrides,
});

interface ApiOptions {
  timezone?: string;
  /** Ocorrências por início de semana; semanas não listadas voltam vazias. */
  weeks?: Record<string, Occurrence[]>;
  weekStatus?: number;
}

function setup(options: ApiOptions = {}, initialUrl = '/semana') {
  const weekCalls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === '/api/auth/refresh') {
        return json(200, { user: user(options.timezone), accessToken: 't' });
      }
      if (url.startsWith('/api/activities')) {
        return json(200, [
          { id: ACTIVITY_ID, areaId: AREA_ID, name: 'Reunião', xpWeight: 1, archivedAt: null },
          {
            id: OTHER_ACTIVITY_ID,
            areaId: AREA_ID,
            name: 'Leitura',
            xpWeight: 1,
            archivedAt: null,
          },
        ]);
      }
      if (url.startsWith('/api/areas')) {
        return json(200, [
          {
            id: AREA_ID,
            name: 'Trabalho',
            color: 'violet',
            icon: 'briefcase',
            position: 0,
            archivedAt: null,
          },
        ]);
      }
      if (url === '/api/blocks' && init?.method === 'POST') {
        // Imita a API: cria o bloco e a ocorrência passa a existir na semana dele.
        const body = JSON.parse(String(init.body));
        const date: string = body.recurrence === 'weekly' ? body.validFrom : body.date;
        const key = weekStartOf(date);
        const created = occurrence({
          blockId: '0192f1a0-7b3c-7000-8000-0000000000c9',
          occurrenceDate: date,
          date,
          startTime: body.startTime,
          durationMin: body.durationMin,
          activityId: body.activityId,
          recurrence: body.recurrence,
        });
        options.weeks = { ...options.weeks, [key]: [...(options.weeks?.[key] ?? []), created] };
        return json(201, {
          id: created.blockId,
          activityId: body.activityId,
          recurrence: body.recurrence,
          weekday: body.weekday ?? null,
          date: body.date ?? null,
          startTime: body.startTime,
          durationMin: body.durationMin,
          validFrom: body.validFrom ?? null,
          validUntil: null,
          goalId: null,
        });
      }
      if (url.startsWith('/api/blocks/week')) {
        const weekStart = new URL(url, 'http://x').searchParams.get('weekStart') as string;
        weekCalls.push(weekStart);
        if (options.weekStatus && options.weekStatus >= 400)
          return json(options.weekStatus, { message: 'falhou' });
        const end = new Date(`${weekStart}T00:00:00Z`);
        end.setUTCDate(end.getUTCDate() + 6);
        return json(200, {
          weekStart,
          weekEnd: end.toISOString().slice(0, 10),
          occurrences: options.weeks?.[weekStart] ?? [],
        });
      }
      return json(404);
    }),
  );

  let search = '';
  function LocationProbe() {
    search = useLocation().search;
    return null;
  }

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <AuthProvider>
          <WeekPage />
          <LocationProbe />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { weekCalls, search: () => search };
}

const grid = () => screen.findByRole('region', { name: 'Grade da semana' });
const column = (name: RegExp) => screen.getByRole('region', { name });

describe('WeekPage', () => {
  beforeEach(() => {
    setAccessToken(null);
    // Congela só o relógio: "hoje" passa a ser quarta 2026-10-07, 12:00 em São Paulo.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T15:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('mostra a semana atual, com o intervalo e os 7 dias', async () => {
    setup();
    await screen.findByRole('region', { name: /segunda-feira, 5 de outubro/ });

    expect(screen.getByText('5 – 11 out 2026')).toBeInTheDocument();
    for (const name of [
      /segunda-feira/,
      /terça-feira/,
      /quarta-feira/,
      /quinta-feira/,
      /sexta-feira/,
      /sábado/,
      /domingo/,
    ]) {
      expect(column(name)).toBeInTheDocument();
    }
  });

  it('destaca o dia de hoje', async () => {
    setup();
    await screen.findByRole('region', { name: /quarta-feira/ });
    expect(screen.getByLabelText('7 de outubro de 2026 (hoje)')).toBeInTheDocument();
    expect(screen.queryByLabelText('8 de outubro de 2026 (hoje)')).not.toBeInTheDocument();
  });

  it('o "hoje" respeita o fuso da pessoa (data civil local, não UTC)', async () => {
    // 02:30 UTC de quarta 07/10 ainda é terça 06/10 em São Paulo
    vi.setSystemTime(new Date('2026-10-07T02:30:00.000Z'));
    setup({ timezone: 'America/Sao_Paulo' });
    await screen.findByRole('region', { name: /terça-feira/ });
    expect(screen.getByLabelText('6 de outubro de 2026 (hoje)')).toBeInTheDocument();
  });

  it('o mesmo instante em outro fuso cai em outro dia', async () => {
    vi.setSystemTime(new Date('2026-10-07T02:30:00.000Z'));
    setup({ timezone: 'Asia/Tokyo' }); // 11:30 de quarta 07/10
    await screen.findByRole('region', { name: /quarta-feira/ });
    expect(screen.getByLabelText('7 de outubro de 2026 (hoje)')).toBeInTheDocument();
  });

  it('coloca cada ocorrência na coluna do dia certo, com nome e horário', async () => {
    setup({
      weeks: {
        '2026-10-05': [
          occurrence({
            date: '2026-10-07',
            occurrenceDate: '2026-10-07',
            startTime: '09:00',
            durationMin: 60,
          }),
          occurrence({
            blockId: '0192f1a0-7b3c-7000-8000-0000000000c2',
            date: '2026-10-09',
            occurrenceDate: '2026-10-09',
            startTime: '14:30',
            durationMin: 90,
            activityId: OTHER_ACTIVITY_ID,
          }),
        ],
      },
    });
    await screen.findByRole('button', { name: /Reunião/ });

    const quarta = column(/quarta-feira/);
    expect(
      within(quarta).getByRole('button', { name: 'Reunião, quarta-feira, 09:00 às 10:00' }),
    ).toBeInTheDocument();
    expect(within(quarta).queryByText('Leitura')).not.toBeInTheDocument();

    const sexta = column(/sexta-feira/);
    expect(
      within(sexta).getByRole('button', { name: 'Leitura, sexta-feira, 14:30 às 16:00' }),
    ).toBeInTheDocument();
  });

  it('ocorrência movida aparece no dia efetivo, não no original', async () => {
    setup({
      weeks: {
        '2026-10-05': [
          occurrence({ occurrenceDate: '2026-10-07', date: '2026-10-11', modified: true }),
        ],
      },
    });
    await screen.findByRole('button', { name: /Reunião/ });

    expect(within(column(/domingo/)).getByRole('button', { name: /Reunião/ })).toBeInTheDocument();
    expect(within(column(/quarta-feira/)).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Alterado')).toBeInTheDocument();
  });

  it('ocorrência pulada fica visível e marcada como pulada', async () => {
    setup({ weeks: { '2026-10-05': [occurrence({ skipped: true })] } });

    const card = await screen.findByRole('button', { name: /pulado/ });
    expect(within(card).getByText('Pulado')).toBeInTheDocument();
    expect(screen.queryByText('Alterado')).not.toBeInTheDocument();
  });

  it('blocos sobrepostos ficam lado a lado, cada um com metade da largura', async () => {
    setup({
      weeks: {
        '2026-10-05': [
          occurrence({ startTime: '09:00', durationMin: 60 }),
          occurrence({
            blockId: '0192f1a0-7b3c-7000-8000-0000000000c2',
            startTime: '09:30',
            durationMin: 60,
            activityId: OTHER_ACTIVITY_ID,
          }),
        ],
      },
    });
    await screen.findAllByRole('button', { name: /Reunião|Leitura/ });

    const cards = within(column(/quarta-feira/)).getAllByRole('button');
    expect(cards).toHaveLength(2);
    const lefts = cards.map((card) => card.style.left);
    expect(new Set(lefts).size).toBe(2);
    expect(cards.every((card) => card.style.width === 'calc(50% - 4px)')).toBe(true);
  });

  it('amplia as horas da grade quando há bloco de madrugada', async () => {
    setup({ weeks: { '2026-10-05': [occurrence({ startTime: '04:30', durationMin: 60 })] } });
    await screen.findByRole('button', { name: /Reunião/ });
    expect(screen.getByText('05:00')).toBeInTheDocument();
    expect(screen.getByText('21:00')).toBeInTheDocument();
  });

  it('mostra a linha de "agora" só no dia de hoje', async () => {
    setup();
    await screen.findByRole('region', { name: /quarta-feira/ });
    const lines = screen.getAllByTestId('now-line');
    expect(lines).toHaveLength(1);
    expect(within(column(/quarta-feira/)).getByTestId('now-line')).toBeInTheDocument();
  });

  it('semana vazia mostra o aviso, mas a grade continua', async () => {
    setup();
    expect(await screen.findByText('Nenhum bloco nesta semana.')).toBeInTheDocument();
    expect(column(/quarta-feira/)).toBeInTheDocument();
  });

  describe('navegação entre semanas', () => {
    it('avança, volta e guarda a semana na URL', async () => {
      const probe = setup();
      await screen.findByText('5 – 11 out 2026');

      await userEvent.click(screen.getByRole('button', { name: 'Próxima semana' }));
      expect(await screen.findByText('12 – 18 out 2026')).toBeInTheDocument();
      expect(probe.search()).toBe('?inicio=2026-10-12');
      expect(probe.weekCalls).toContain('2026-10-12');

      await userEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
      await userEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
      expect(await screen.findByText('28 set – 4 out 2026')).toBeInTheDocument();
      expect(probe.search()).toBe('?inicio=2026-09-28');
    });

    it('"Hoje" volta para a semana atual e fica desabilitado quando já está nela', async () => {
      const probe = setup();
      const todayButton = await screen.findByRole('button', { name: 'Hoje' });
      expect(todayButton).toBeDisabled();

      await userEvent.click(screen.getByRole('button', { name: 'Próxima semana' }));
      await screen.findByText('12 – 18 out 2026');
      expect(todayButton).toBeEnabled();

      await userEvent.click(todayButton);
      expect(await screen.findByText('5 – 11 out 2026')).toBeInTheDocument();
      expect(probe.search()).toBe('');
      expect(todayButton).toBeDisabled();
    });

    it('já busca as semanas vizinhas, para a navegação ser instantânea', async () => {
      const probe = setup();
      await screen.findByText('5 – 11 out 2026');
      await waitFor(() =>
        expect(probe.weekCalls).toEqual(
          expect.arrayContaining(['2026-09-28', '2026-10-05', '2026-10-12']),
        ),
      );
    });

    it('abre a semana pedida na URL', async () => {
      const probe = setup({}, '/semana?inicio=2026-09-28');
      expect(await screen.findByText('28 set – 4 out 2026')).toBeInTheDocument();
      expect(probe.weekCalls).toContain('2026-09-28');
    });

    it('uma data da URL que não é segunda-feira vira a segunda dessa semana', async () => {
      setup({}, '/semana?inicio=2026-10-08'); // quinta
      expect(await screen.findByText('5 – 11 out 2026')).toBeInTheDocument();
    });

    it('lixo na URL cai na semana atual, sem quebrar', async () => {
      setup({}, '/semana?inicio=amanha');
      expect(await screen.findByText('5 – 11 out 2026')).toBeInTheDocument();
    });

    it('mostra a semana que vira o ano com os dois anos no título', async () => {
      setup({}, '/semana?inicio=2026-12-28');
      expect(await screen.findByText('28 dez 2026 – 3 jan 2027')).toBeInTheDocument();
      expect(column(/domingo, 3 de janeiro de 2027/)).toBeInTheDocument();
    });
  });

  it('mostra erro com opção de tentar de novo quando a API falha', async () => {
    setup({ weekStatus: 500 });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar a semana',
    );
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });

  it('cria um bloco pelo botão "Novo bloco" e ele aparece na grade, no dia certo', async () => {
    setup();
    await screen.findByText('Nenhum bloco nesta semana.');

    await userEvent.click(screen.getByRole('button', { name: 'Novo bloco' }));
    await screen.findByRole('option', { name: 'Reunião' });
    await userEvent.selectOptions(screen.getByLabelText('Atividade'), 'Reunião');
    await userEvent.click(screen.getByRole('button', { name: 'Criar bloco' }));

    // hoje é quarta (2026-10-07), o padrão do formulário
    const card = await screen.findByRole('button', {
      name: 'Reunião, quarta-feira, 09:00 às 10:00',
    });
    expect(within(column(/quarta-feira/)).getByRole('button')).toBe(card);
    expect(screen.queryByText('Nenhum bloco nesta semana.')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('o título da página identifica o planejador', async () => {
    setup();
    await grid();
    expect(screen.getByRole('heading', { name: 'Sua semana' })).toBeInTheDocument();
  });
});
