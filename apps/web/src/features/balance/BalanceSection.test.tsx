import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/lib/apiClient';
import { BalanceSection } from './BalanceSection';

const area = (n: number, over: Record<string, unknown> = {}) => ({
  areaId: `0192f1a0-7b3c-7000-8000-00000000000${n}`,
  name: `Área ${n}`,
  color: 'moss',
  icon: 'heart-pulse',
  planned: 4,
  completed: 3,
  score: 75,
  ...over,
});
const none = { planned: 0, completed: 0, score: null };
const balance = (areas: unknown[]) => ({
  windowStart: '2026-09-10',
  windowEnd: '2026-10-07',
  areas,
});

function setup(response: () => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async () => response()),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BalanceSection />
    </QueryClientProvider>,
  );
}
const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('BalanceSection', () => {
  beforeEach(() => setAccessToken('token'));
  afterEach(() => vi.unstubAllGlobals());

  it('mostra o radar e explica que conta blocos, não XP nem minutos', async () => {
    setup(() => ok(balance([area(1), area(2), area(3)])));

    expect(await screen.findByRole('heading', { name: 'Equilíbrio das áreas' })).toBeVisible();
    expect(screen.getByText(/Conta blocos, não XP nem minutos/)).toBeVisible();
    expect(screen.getAllByText('75%')).toHaveLength(3);
    expect(fetch).toHaveBeenCalledWith('/api/balance', expect.anything());
  });

  it('sem nenhum bloco planejado no período, a seção não aparece', async () => {
    const { container } = setup(() => ok(balance([area(1, none), area(2, none), area(3, none)])));
    // espera a consulta resolver
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(container).toBeEmptyDOMElement();
  });

  it('se a rota falhar, some em silêncio (sem alerta de erro)', async () => {
    const { container } = setup(() => new Response('{}', { status: 500 }));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
