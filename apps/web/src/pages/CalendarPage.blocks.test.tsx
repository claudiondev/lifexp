import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Completion, Occurrence } from '@lifexp/shared';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { setAccessToken } from '@/lib/apiClient';
import { CalendarPage } from './CalendarPage';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() }, Toaster: () => null }));

const AREA_A = '0192f1a0-7b3c-7000-8000-0000000000b1';
const AREA_B = '0192f1a0-7b3c-7000-8000-0000000000b2';
const ACT_A = '0192f1a0-7b3c-7000-8000-0000000000a1';
const ACT_B = '0192f1a0-7b3c-7000-8000-0000000000a2';

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let seq = 0;
const occ = (date: string, over: Partial<Occurrence> = {}): Occurrence => {
  seq += 1;
  return {
    blockId: `0192f1a0-7b3c-7000-8000-0000000c${String(seq).padStart(4, '0')}`,
    occurrenceDate: date,
    date,
    startTime: '09:00',
    durationMin: 60,
    activityId: ACT_A,
    areaId: AREA_A,
    goalId: null,
    note: null,
    recurrence: 'once',
    skipped: false,
    modified: false,
    ...over,
  };
};
const done = (o: Occurrence): Completion => ({
  blockId: o.blockId,
  occurrenceDate: o.occurrenceDate,
  completedAt: '2026-10-07T12:00:00.000Z',
  xpAmount: 60,
});

function setup(options: {
  occurrences?: Occurrence[];
  completions?: Completion[];
  rangeStatus?: number;
  desktop?: boolean;
}) {
  const rangeCalls: string[] = [];
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
    vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
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
      if (url.startsWith('/api/areas')) {
        return json(200, [
          {
            id: AREA_A,
            name: 'Trabalho',
            color: 'violet',
            icon: 'briefcase',
            position: 0,
            archivedAt: null,
          },
          {
            id: AREA_B,
            name: 'Saúde',
            color: 'moss',
            icon: 'dumbbell',
            position: 1,
            archivedAt: null,
          },
        ]);
      }
      if (url.startsWith('/api/activities')) {
        return json(200, [
          { id: ACT_A, areaId: AREA_A, name: 'Reunião', xpWeight: 1, archivedAt: null },
          { id: ACT_B, areaId: AREA_B, name: 'Corrida', xpWeight: 1, archivedAt: null },
        ]);
      }
      if (url.startsWith('/api/events?')) return json(200, []);
      if (url.startsWith('/api/blocks/range')) {
        rangeCalls.push(url);
        if (options.rangeStatus) return json(options.rangeStatus, { message: 'falhou' });
        const params = new URL(url, 'http://x').searchParams;
        const weekStart = params.get('weekStart')!;
        const weeks = Number(params.get('weeks'));
        const last = new Date(Date.parse(`${weekStart}T00:00:00Z`) + (weeks * 7 - 1) * 86400000)
          .toISOString()
          .slice(0, 10);
        const inRange = (date: string) => date >= weekStart && date <= last;
        return json(200, {
          weekStart,
          weekEnd: last,
          occurrences: (options.occurrences ?? []).filter((o) => inRange(o.date)),
          completions: options.completions ?? [],
        });
      }
      return json(404);
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/calendario']}>
        <AuthProvider>
          <CalendarPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { rangeCalls };
}

const grid = () => screen.findByRole('region', { name: 'Grade do mês' });
const dayButton = (section: ReturnType<typeof within>, text: RegExp) =>
  section.getByRole('button', { name: text });

describe('CalendarPage: blocos no mês', () => {
  beforeEach(() => {
    setAccessToken(null);
    seq = 0;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T15:00:00.000Z')); // quarta 12:00 em São Paulo
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('pede os blocos da grade inteira numa consulta só (5 semanas a partir de 28/09)', async () => {
    const { rangeCalls } = setup({});
    await grid();
    await waitFor(() =>
      expect(rangeCalls).toEqual(['/api/blocks/range?weekStart=2026-09-28&weeks=5']),
    );
  });

  it('cada dia com blocos mostra o resumo (concluídos/total e tempo) e a faixa por área', async () => {
    const a = occ('2026-10-07');
    const b = occ('2026-10-07', {
      startTime: '14:00',
      durationMin: 30,
      activityId: ACT_B,
      areaId: AREA_B,
    });
    setup({ occurrences: [a, b], completions: [done(a)] });
    const section = within(await grid());

    expect(await section.findByText('1/2 · 1 h 30 min')).toBeInTheDocument();
    expect(section.getAllByTestId('area-strip')).toHaveLength(1);
  });

  it('o rótulo do dia inclui a quantidade de blocos', async () => {
    setup({
      occurrences: [
        occ('2026-10-07'),
        occ('2026-10-07', { startTime: '11:00' }),
        occ('2026-10-08'),
      ],
    });
    const section = within(await grid());
    await section.findByText(/0\/2/);
    expect(
      dayButton(section, /quarta-feira, 7 de outubro de 2026 \(hoje\), 0 eventos, 2 blocos$/),
    ).toBeInTheDocument();
    expect(
      dayButton(section, /quinta-feira, 8 de outubro de 2026, 0 eventos, 1 bloco$/),
    ).toBeInTheDocument();
  });

  it('bloco pulado não conta no resumo do dia', async () => {
    setup({
      occurrences: [occ('2026-10-07'), occ('2026-10-07', { skipped: true, startTime: '11:00' })],
    });
    const section = within(await grid());
    expect(await section.findByText('0/1 · 1 h')).toBeInTheDocument();
  });

  it('o dia aberto lista os blocos em ordem de horário, com link para a Semana dele', async () => {
    const late = occ('2026-10-07', { startTime: '15:00', activityId: ACT_B, areaId: AREA_B });
    const early = occ('2026-10-07', { startTime: '08:00' });
    setup({ occurrences: [late, early], completions: [done(early)] });
    await grid();

    const list = await screen.findByRole('region', { name: 'Blocos do dia' });
    const links = await within(list).findAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      expect.stringContaining('Reunião'),
      expect.stringContaining('Corrida'),
    ]);
    expect(links[0]).toHaveAttribute('href', '/semana?inicio=2026-10-05');
    expect(links[0]).toHaveTextContent('+60 XP');
    expect(links[1]).not.toHaveTextContent('XP');
  });

  it('escolher outro dia troca a lista de blocos', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setup({
      occurrences: [occ('2026-10-07'), occ('2026-10-09', { activityId: ACT_B, areaId: AREA_B })],
    });
    const section = within(await grid());
    await section.findAllByText(/0\/1/);

    await user.click(dayButton(section, /sexta-feira, 9 de outubro de 2026/));
    const list = screen.getByRole('region', { name: 'Blocos do dia' });
    expect(await within(list).findByText('Corrida')).toBeInTheDocument();
    expect(within(list).queryByText('Reunião')).not.toBeInTheDocument();
  });

  it('dia sem blocos avisa em texto', async () => {
    setup({});
    await grid();
    expect(
      await within(screen.getByRole('region', { name: 'Blocos do dia' })).findByText(
        'Nenhum bloco neste dia.',
      ),
    ).toBeInTheDocument();
  });

  it('se os blocos falharem, o mês continua e não aparece alerta (é um extra)', async () => {
    setup({ rangeStatus: 500 });
    const section = within(await grid());
    expect(section.getAllByRole('button', { name: /eventos?$/ })).toHaveLength(35);
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(section.queryByTestId('area-strip')).not.toBeInTheDocument();
  });

  it('no celular mostra só a faixa por área (sem o texto do resumo)', async () => {
    setup({ occurrences: [occ('2026-10-07')], desktop: false });
    const section = within(await grid());
    await waitFor(() => expect(section.getAllByTestId('area-strip')).toHaveLength(1));
    expect(section.queryByText(/0\/1/)).not.toBeInTheDocument();
  });
});
