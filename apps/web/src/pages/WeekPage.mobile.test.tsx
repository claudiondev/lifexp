import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Completion, Occurrence } from '@lifexp/shared';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { setAccessToken } from '@/lib/apiClient';
import { WeekPage } from './WeekPage';

const AREA_ID = '0192f1a0-7b3c-7000-8000-0000000000b1';
const ACTIVITY_ID = '0192f1a0-7b3c-7000-8000-0000000000a1';
const OTHER_ACTIVITY_ID = '0192f1a0-7b3c-7000-8000-0000000000a2';

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

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

const WEEKS: Record<string, Occurrence[]> = {
  '2026-10-05': [
    occurrence(), // quarta 09:00 Reunião
    occurrence({
      blockId: '0192f1a0-7b3c-7000-8000-0000000000c2',
      occurrenceDate: '2026-10-09',
      date: '2026-10-09',
      startTime: '16:00',
      activityId: OTHER_ACTIVITY_ID,
    }), // sexta 16:00 Leitura
  ],
  '2026-10-12': [
    occurrence({
      blockId: '0192f1a0-7b3c-7000-8000-0000000000c3',
      occurrenceDate: '2026-10-12',
      date: '2026-10-12',
      startTime: '07:00',
    }), // segunda da semana seguinte
  ],
};

const COMPLETIONS: Record<string, Completion[]> = {
  '2026-10-05': [
    {
      blockId: '0192f1a0-7b3c-7000-8000-0000000000c1',
      occurrenceDate: '2026-10-07',
      completedAt: '2026-10-07T13:00:00.000Z',
      xpAmount: 60,
    }, // a Reunião de quarta
  ],
};

function setup(isDesktop = false) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: isDesktop,
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
      if (url.startsWith('/api/blocks/week')) {
        const weekStart = new URL(url, 'http://x').searchParams.get('weekStart') as string;
        return json(200, {
          weekStart,
          weekEnd: weekStart,
          occurrences: WEEKS[weekStart] ?? [],
          completions: COMPLETIONS[weekStart] ?? [],
        });
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
}

const tab = (name: RegExp) => screen.findByRole('tab', { name });
const panel = () => screen.getByRole('tabpanel');

describe('WeekPage no celular (visão dia a dia)', () => {
  beforeEach(() => {
    setAccessToken(null);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T15:00:00.000Z')); // quarta 12:00 em São Paulo
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('mostra abas dos dias em vez da grade de 7 colunas', async () => {
    setup(false);
    await tab(/quarta-feira/);

    expect(screen.getByRole('tablist', { name: 'Dias da semana' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(7);
    expect(screen.queryByTestId('now-line')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: /segunda-feira, 5 de outubro/ }),
    ).not.toBeInTheDocument();
  });

  it('em tela grande continua mostrando a grade e não as abas', async () => {
    setup(true);
    await screen.findByRole('region', { name: /quarta-feira/ });
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('abre no dia de hoje, com os blocos dele', async () => {
    setup(false);
    expect(await tab(/quarta-feira.*\(hoje\)/)).toHaveAttribute('aria-selected', 'true');
    expect(
      within(panel()).getByRole('button', { name: /Reunião, quarta-feira, 09:00 às 10:00/ }),
    ).toBeInTheDocument();
    expect(within(panel()).queryByRole('button', { name: /Leitura/ })).not.toBeInTheDocument();
  });

  it('marca como concluído, com o XP, só o bloco que foi concluído', async () => {
    setup(false);
    await tab(/quarta-feira.*\(hoje\)/);

    const done = within(panel()).getByRole('button', {
      name: /Reunião, quarta-feira.*, concluído/,
    });
    expect(done).toHaveTextContent('+60 XP');

    await userEvent.click(await tab(/sexta-feira/));
    const pending = within(panel()).getByRole('button', { name: /Leitura, sexta-feira/ });
    expect(pending).not.toHaveTextContent('XP');
    expect(pending).not.toHaveAccessibleName(/concluído/);
  });

  it('trocar de dia mostra os blocos do outro dia', async () => {
    setup(false);
    await userEvent.click(await tab(/sexta-feira/));

    expect(
      within(panel()).getByRole('button', { name: /Leitura, sexta-feira, 16:00 às 17:00/ }),
    ).toBeInTheDocument();
    expect(within(panel()).queryByRole('button', { name: /Reunião/ })).not.toBeInTheDocument();
  });

  it('tocar num bloco abre o painel de ações', async () => {
    setup(false);
    await userEvent.click(
      await within(await screen.findByRole('tabpanel')).findByRole('button', { name: /Reunião/ }),
    );

    const dialog = await screen.findByRole('dialog');
    // a Reunião de quarta está concluída neste cenário: o painel oferece desfazer, não pular
    expect(within(dialog).getByRole('button', { name: /Desfazer conclusão/ })).toBeInTheDocument();
  });

  it('em outra semana abre na segunda-feira, e "Hoje" volta ao dia de hoje', async () => {
    setup(false);
    await tab(/quarta-feira/);

    await userEvent.click(screen.getByRole('button', { name: 'Próxima semana' }));
    expect(await tab(/segunda-feira, 12 de outubro/)).toHaveAttribute('aria-selected', 'true');
    expect(
      within(panel()).getByRole('button', { name: /Reunião, segunda-feira, 07:00/ }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(await tab(/quarta-feira.*\(hoje\)/)).toHaveAttribute('aria-selected', 'true');
  });

  it('o dia escolhido é esquecido ao trocar de semana (não fica preso num dia que não existe)', async () => {
    setup(false);
    await userEvent.click(await tab(/sexta-feira/));
    expect(await tab(/sexta-feira/)).toHaveAttribute('aria-selected', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Próxima semana' }));

    expect(await tab(/segunda-feira, 12 de outubro/)).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /sexta-feira, 16 de outubro/ })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('mantém o botão de criar bloco no celular', async () => {
    setup(false);
    await tab(/quarta-feira/);
    expect(screen.getByRole('button', { name: 'Novo bloco' })).toBeInTheDocument();
  });
});
