import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACHIEVEMENT_CATALOG, ACHIEVEMENT_KEYS } from '@lifexp/shared';
import { setAccessToken } from '@/lib/apiClient';
import { AchievementsPage } from './AchievementsPage';

const entry = (key: (typeof ACHIEVEMENT_KEYS)[number], over: Record<string, unknown> = {}) => ({
  key,
  title: ACHIEVEMENT_CATALOG[key].title,
  description: ACHIEVEMENT_CATALOG[key].description,
  unlocked: false,
  unlockedAt: null,
  progress: null,
  ...over,
});

function setup(response: () => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async () => response()),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AchievementsPage />
    </QueryClientProvider>,
  );
}
const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('AchievementsPage', () => {
  beforeEach(() => setAccessToken('token'));
  afterEach(() => vi.unstubAllGlobals());

  it('mostra todas as conquistas, com a contagem das desbloqueadas', async () => {
    setup(() =>
      ok([
        entry('first_step', { unlocked: true, unlockedAt: '2026-10-05T15:00:00.000Z' }),
        ...ACHIEVEMENT_KEYS.slice(1).map((key) => entry(key)),
      ]),
    );

    const list = await screen.findByRole('list', { name: 'Conquistas' });
    expect(fetch).toHaveBeenCalledWith('/api/achievements', expect.anything());
    expect(within(list).getAllByRole('listitem')).toHaveLength(8);
    expect(screen.getByText(/1 de 8 desbloqueadas/)).toBeVisible();
    expect(within(list).getByText('Primeiro passo')).toBeVisible();
    expect(within(list).getByText(/Desbloqueada em/)).toBeVisible();
  });

  it('as bloqueadas numéricas mostram a barra de progresso', async () => {
    setup(() =>
      ok(
        ACHIEVEMENT_KEYS.map((key) =>
          key === 'constant' ? entry(key, { progress: { current: 3, target: 7 } }) : entry(key),
        ),
      ),
    );

    const bar = await screen.findByRole('progressbar', { name: 'Progresso de Constante' });
    expect(bar).toHaveAttribute('aria-valuenow', '3');
    expect(bar).toHaveAttribute('aria-valuemax', '7');
    expect(bar).toHaveAttribute('aria-valuetext', '3 de 7');
    expect(screen.getAllByRole('progressbar', { name: /^Progresso de / })).toHaveLength(1);
  });

  it('uma desbloqueada não mostra barra nem "bloqueada"', async () => {
    setup(() =>
      ok(
        ACHIEVEMENT_KEYS.map((key) =>
          key === 'constant'
            ? entry(key, {
                unlocked: true,
                unlockedAt: '2026-10-05T15:00:00.000Z',
                progress: { current: 7, target: 7 },
              })
            : entry(key),
        ),
      ),
    );

    await screen.findByText('Constante');
    expect(screen.queryByRole('progressbar', { name: /^Progresso de / })).not.toBeInTheDocument();
  });

  it('a coleção mostra quantas conquistas já foram desbloqueadas', async () => {
    setup(() =>
      ok(
        ACHIEVEMENT_KEYS.map((key, index) =>
          index < 2
            ? entry(key, { unlocked: true, unlockedAt: '2026-09-01T12:00:00.000Z' })
            : entry(key),
        ),
      ),
    );

    const bar = await screen.findByRole('progressbar', { name: 'Coleção de conquistas' });
    expect(bar).toHaveAttribute('aria-valuetext', `2 de ${ACHIEVEMENT_KEYS.length} conquistas`);
  });

  it('se a rota falhar, mostra o erro com "Tentar de novo"', async () => {
    setup(() => new Response('{}', { status: 500 }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar as conquistas.',
    );
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
  });
});
