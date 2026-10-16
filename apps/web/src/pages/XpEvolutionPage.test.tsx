import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { XpEvolution, XpEvolutionWeek } from '@lifexp/shared';
import { json } from '@/features/goals/testing';
import { setAccessToken } from '@/lib/apiClient';
import { XpEvolutionPage } from './XpEvolutionPage';

const AREA_A = '0192f1a0-7b3c-7000-8000-000000000a01';
const AREA_B = '0192f1a0-7b3c-7000-8000-000000000a02';

const week = (
  weekStart: string,
  byArea: {
    areaId?: string | null;
    name: string;
    color: 'violet' | 'gold' | null;
    amount: number;
  }[],
): XpEvolutionWeek => {
  const gained = byArea.filter((a) => a.amount > 0).reduce((s, a) => s + a.amount, 0);
  const reverted = byArea.filter((a) => a.amount < 0).reduce((s, a) => s - a.amount, 0);
  return {
    weekStart,
    gained,
    reverted,
    net: gained - reverted,
    byArea: byArea.map((a, index) => ({
      areaId: a.areaId === undefined ? (index === 0 ? AREA_A : AREA_B) : a.areaId,
      name: a.name,
      color: a.color,
      amount: a.amount,
    })),
  };
};

/** Devolve as últimas `weeks` semanas de `all` (a API real corta a janela no servidor). */
function setup(all: XpEvolutionWeek[], options: { failTimes?: number } = {}) {
  setAccessToken('token');
  const calls: string[] = [];
  let failures = options.failTimes ?? 0;
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      calls.push(url);
      if (!url.startsWith('/api/xp/evolution')) return json(404);
      if (failures > 0) {
        failures -= 1;
        return json(500, { message: 'falhou' });
      }
      const weeks = Number(new URL(url, 'http://x').searchParams.get('weeks'));
      const body: XpEvolution = { weeks: all.slice(-weeks), today: '2026-10-14' };
      return json(200, body);
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <XpEvolutionPage />
    </QueryClientProvider>,
  );
  return { calls };
}

// 12 semanas terminando em 2026-10-12 (a atual). As 4 últimas têm XP.
const mondays = Array.from({ length: 12 }, (_, i) => {
  const date = new Date(Date.UTC(2026, 9, 12 - (11 - i) * 7));
  return date.toISOString().slice(0, 10);
});
const WEEKS: XpEvolutionWeek[] = mondays.map((monday, index) => {
  if (index === 8) return week(monday, [{ name: 'Estudo', color: 'violet', amount: 120 }]);
  if (index === 9)
    return week(monday, [
      { name: 'Estudo', color: 'violet', amount: 100 },
      { name: 'Saúde', color: 'gold', amount: 60 },
    ]);
  if (index === 10) return week(monday, [{ name: 'Estudo', color: 'violet', amount: 80 }]);
  if (index === 11) return week(monday, [{ name: 'Saúde', color: 'gold', amount: 150 }]);
  return week(monday, []);
});

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T15:00:00Z') }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('XpEvolutionPage', () => {
  it('mostra o gráfico com uma coluna por semana, 8 por padrão, e a atual por último', async () => {
    const { calls } = setup(WEEKS);
    expect(await screen.findAllByTestId('xp-bar')).toHaveLength(8);
    expect(calls[0]).toBe('/api/xp/evolution?weeks=8');
    const bars = screen.getAllByTestId('xp-bar');
    expect(bars.at(-1)).toHaveAttribute('data-week', mondays[11]);
    expect(screen.getByText('Atual')).toBeInTheDocument();
  });

  it('descreve cada semana para leitor de tela, com o XP líquido', async () => {
    setup(WEEKS);
    await screen.findAllByTestId('xp-bar');
    expect(screen.getByText('Semana de 24/08: 0 XP')).toBeInTheDocument();
    expect(screen.getByText('Semana de 12/10 (atual): 150 XP')).toBeInTheDocument();
    expect(screen.getByText('Semana de 05/10: 80 XP')).toBeInTheDocument();
  });

  it('o comparativo fala em tom positivo e mostra a melhor semana', async () => {
    setup(WEEKS);
    const summary = await screen.findByRole('region', { name: 'Esta semana' });
    expect(within(summary).getByText('150 XP', { exact: true })).toBeInTheDocument();
    expect(within(summary).getByText(/\+70 XP a mais que a semana passada/)).toBeInTheDocument();
    expect(within(summary).getByText(/Melhor semana: 28\/09 · 160 XP/)).toBeInTheDocument();
  });

  it('semana atual abaixo da anterior: sem cobrança', async () => {
    const lower = [
      ...WEEKS.slice(0, 11),
      week(mondays[11]!, [{ name: 'Saúde', color: 'gold', amount: 30 }]),
    ];
    setup(lower);
    const summary = await screen.findByRole('region', { name: 'Esta semana' });
    expect(within(summary).getByText(/ainda tem dias pela frente/)).toBeInTheDocument();
    expect(summary.textContent).not.toMatch(/queda|perdeu|pior|atras/i);
  });

  it('lista o XP por área na semana atual', async () => {
    setup(WEEKS);
    const areas = await screen.findByRole('region', { name: 'Por área nesta semana' });
    expect(within(areas).getByText('Saúde')).toBeInTheDocument();
    expect(within(areas).getByText('150 XP')).toBeInTheDocument();
  });

  it('trocar o período refaz a consulta com o novo número de semanas', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { calls } = setup(WEEKS);
    await screen.findAllByTestId('xp-bar');

    await user.click(screen.getByRole('button', { name: '12 semanas' }));
    expect(await screen.findAllByTestId('xp-bar')).toHaveLength(12);
    expect(calls).toContain('/api/xp/evolution?weeks=12');
    expect(screen.getByRole('button', { name: '12 semanas' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: '8 semanas' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('sem nenhum XP no período, convida a concluir um bloco em vez de mostrar gráfico vazio', async () => {
    setup(WEEKS.map((w) => week(w.weekStart, [])));
    expect(await screen.findByText(/Nenhum XP neste período ainda/)).toBeInTheDocument();
    expect(screen.queryByTestId('xp-bar')).not.toBeInTheDocument();
  });

  it('erro de carregamento avisa e permite tentar de novo', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setup(WEEKS, { failTimes: 1 });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar a evolução do XP.',
    );
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findAllByTestId('xp-bar')).toHaveLength(8);
  });
});
