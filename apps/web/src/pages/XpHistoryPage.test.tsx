import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User, XpHistoryEntry } from '@lifexp/shared';
import { AuthContext, type AuthContextValue } from '@/features/auth/AuthContext';
import { progressKey } from '@/features/character/useProgress';
import { json } from '@/features/goals/testing';
import { setAccessToken } from '@/lib/apiClient';
import { XpHistoryPage } from './XpHistoryPage';

const NOW = new Date('2026-10-07T18:00:00.000Z'); // quarta 15:00 em São Paulo
const id = (n: number) => `0192f1a0-7b3c-7000-8000-${String(n).padStart(12, '0')}`;

const USER: User = {
  id: id(900),
  name: 'Ana',
  email: 'ana@test.dev',
  timezone: 'America/Sao_Paulo',
  avatarKey: 'swords',
  createdAt: '2026-01-01T00:00:00.000Z',
} as User;

const entry = (n: number, over: Partial<XpHistoryEntry> = {}): XpHistoryEntry => ({
  id: id(n),
  type: 'completion',
  amount: 60,
  areaId: id(800),
  areaName: 'Saúde',
  createdAt: '2026-10-07T15:00:00.000Z',
  sourceLabel: `Bloco ${n}`,
  reversedType: null,
  ...over,
});

/** API falsa que imita o servidor: mais novo primeiro, filtro por tipo, cursor `before` e limite. */
function setup(all: XpHistoryEntry[], options: { failTimes?: number } = {}) {
  const calls: string[] = [];
  let failures = options.failTimes ?? 0;
  const sorted = [...all].sort((a, b) => (a.id < b.id ? 1 : -1));
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      calls.push(url);
      if (!url.startsWith('/api/xp/history')) return json(404);
      if (failures > 0) {
        failures -= 1;
        return json(500, { message: 'falhou' });
      }
      const params = new URL(url, 'http://x').searchParams;
      const limit = Number(params.get('limit'));
      const type = params.get('type');
      const before = params.get('before');
      const rows = sorted.filter(
        (row) => (!type || row.type === type) && (!before || row.id < before),
      );
      const items = rows.slice(0, limit);
      return json(200, {
        items,
        nextCursor: rows.length > limit ? items[items.length - 1]!.id : null,
      });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const auth: AuthContextValue = {
    state: { status: 'authenticated', user: USER },
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    updateProfile: vi.fn(),
  };
  render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={auth}>
        <XpHistoryPage />
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
  return { calls, client };
}

describe('XpHistoryPage', () => {
  beforeEach(() => {
    setAccessToken('token');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('histórico vazio convida a começar, sem "carregar mais"', async () => {
    setup([]);
    expect(await screen.findByText(/Nenhum XP por aqui ainda/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument();
  });

  it('mostra origem, área, hora local e valor, agrupados por dia com o saldo', async () => {
    setup([
      entry(4, { type: 'goal', amount: 500, sourceLabel: 'Escrever o livro', areaName: null }),
      entry(3, {
        type: 'reversal',
        amount: -100,
        reversedType: 'milestone',
        sourceLabel: 'Rascunho',
        createdAt: '2026-10-07T14:30:00.000Z',
      }),
      entry(2, {
        type: 'milestone',
        amount: 100,
        sourceLabel: null,
        createdAt: '2026-10-07T02:30:00.000Z', // 06/10 23:30 em São Paulo
      }),
      entry(1, { sourceLabel: 'Corrida', createdAt: '2026-10-05T12:00:00.000Z' }),
    ]);

    const today = await screen.findByRole('region', { name: 'Hoje' });
    const rows = within(today).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Escrever o livro');
    expect(rows[0]).toHaveTextContent('Meta · 12:00');
    expect(rows[0]).toHaveTextContent('+500 XP');
    expect(rows[1]).toHaveTextContent('Rascunho');
    expect(rows[1]).toHaveTextContent('Estorno de marco · Saúde · 11:30');
    expect(rows[1]).toHaveTextContent('−100 XP');
    expect(within(today).getByText('+400 XP')).toBeInTheDocument(); // saldo do dia

    const yesterday = screen.getByRole('region', { name: 'Ontem' });
    expect(within(yesterday).getByRole('listitem')).toHaveTextContent('Marco excluído');
    expect(within(yesterday).getByRole('listitem')).toHaveTextContent('Marco · Saúde · 23:30');

    const older = screen.getByRole('region', { name: '5 de outubro de 2026' });
    expect(within(older).getByRole('listitem')).toHaveTextContent('Corrida');
    expect(within(older).getByRole('listitem')).toHaveTextContent('Bloco · Saúde · 09:00');
  });

  it('"Carregar mais" traz a página seguinte pelo cursor, sem repetir, e some no fim', async () => {
    const user = userEvent.setup();
    const { calls } = setup(Array.from({ length: 45 }, (_, index) => entry(index + 1)));

    expect(await screen.findByText('Bloco 45')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(20);
    expect(screen.queryByText('Bloco 25')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Carregar mais' }));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(40));
    expect(calls.at(-1)).toContain(`before=${id(26)}`);

    await user.click(screen.getByRole('button', { name: 'Carregar mais' }));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(45));
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument();
    const titles = screen.getAllByRole('listitem').map((row) => row.textContent);
    expect(new Set(titles).size).toBe(45);
  });

  it('filtra por origem pedindo o tipo ao servidor', async () => {
    const user = userEvent.setup();
    const { calls } = setup([
      entry(1, { sourceLabel: 'Corrida' }),
      entry(2, { type: 'milestone', amount: 100, sourceLabel: 'Rascunho' }),
    ]);
    await screen.findByText('Corrida');
    expect(screen.getByRole('button', { name: 'Tudo' })).toHaveAttribute('aria-pressed', 'true');
    expect(calls[0]).not.toContain('type=');

    await user.click(screen.getByRole('button', { name: 'Marcos' }));

    await waitFor(() => expect(screen.queryByText('Corrida')).not.toBeInTheDocument());
    expect(screen.getByText('Rascunho')).toBeInTheDocument();
    expect(calls.at(-1)).toContain('type=milestone');
    expect(screen.getByRole('button', { name: 'Marcos' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Estornos' }));
    expect(await screen.findByText(/Nenhum estorno/)).toBeInTheDocument();
    expect(calls.at(-1)).toContain('type=reversal');
  });

  it('falha ao carregar mostra erro e permite tentar de novo', async () => {
    const user = userEvent.setup();
    setup([entry(1, { sourceLabel: 'Corrida' })], { failTimes: 1 });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar o histórico de XP.',
    );
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Corrida')).toBeInTheDocument();
  });

  it('invalidar o progresso (concluir, desfazer...) recarrega o histórico', async () => {
    const { calls, client } = setup([entry(1, { sourceLabel: 'Corrida' })]);
    await screen.findByText('Corrida');
    const before = calls.length;

    await client.invalidateQueries({ queryKey: progressKey });

    await waitFor(() => expect(calls.length).toBeGreaterThan(before));
  });
});
