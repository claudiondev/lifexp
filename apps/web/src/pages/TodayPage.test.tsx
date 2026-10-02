import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodayItem } from '@lifexp/shared';
import { setAccessToken } from '@/lib/apiClient';
import { useCharacter } from '@/features/character/useCharacter';
import { TodayPage } from './TodayPage';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast, Toaster: () => null }));

const AREA = '0192f1a0-7b3c-7000-8000-0000000000b1';
const ACT_RUN = '0192f1a0-7b3c-7000-8000-0000000000a1';
const ACT_READ = '0192f1a0-7b3c-7000-8000-0000000000a2';
const BLOCK_1 = '0192f1a0-7b3c-7000-8000-0000000000c1';
const BLOCK_2 = '0192f1a0-7b3c-7000-8000-0000000000c2';
const BLOCK_3 = '0192f1a0-7b3c-7000-8000-0000000000c3';

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const level = (xp: number, lvl: number) => ({
  xp,
  level: lvl,
  xpIntoLevel: 10,
  xpForNextLevel: 183,
  progress: 0.05,
});

function makeItem(blockId: string, overrides: Partial<TodayItem> = {}): TodayItem {
  return {
    blockId,
    occurrenceDate: '2026-10-07',
    date: '2026-10-07',
    startTime: '09:00',
    durationMin: 60,
    activityId: ACT_RUN,
    areaId: AREA,
    goalId: null,
    recurrence: 'weekly',
    skipped: false,
    modified: false,
    status: 'open',
    opensAt: '2026-10-07T12:00:00.000Z',
    closesAt: '2026-10-09T02:59:59.999Z',
    xpPreview: 90,
    completion: null,
    ...overrides,
  };
}

interface Options {
  items: TodayItem[];
  /** Resposta do POST de conclusão; padrão: ganhou 90 XP sem subir de nível. */
  completeResponse?: () => Response;
  streak?: { current: number; best: number; lastFulfilledDate: string | null };
}

function setup({
  items,
  completeResponse,
  streak = { current: 3, best: 7, lastFulfilledDate: '2026-10-06' },
}: Options) {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  let totalXp = 100;
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });

      if (url === '/api/today') {
        return json(200, { date: '2026-10-07', items, xpToday: 90, total: level(100, 2) });
      }
      if (url === '/api/progress')
        return json(200, {
          total: level(totalXp, 2),
          areas: [],
          streak,
        });
      if (url.startsWith('/api/activities')) {
        return json(200, [
          { id: ACT_RUN, areaId: AREA, name: 'Corrida', xpWeight: 1.5, archivedAt: null },
          { id: ACT_READ, areaId: AREA, name: 'Leitura', xpWeight: 1, archivedAt: null },
        ]);
      }
      if (url.startsWith('/api/areas')) {
        return json(200, [
          {
            id: AREA,
            name: 'Saúde',
            color: 'moss',
            icon: 'heart-pulse',
            position: 0,
            archivedAt: null,
          },
        ]);
      }
      if (url.endsWith('/completion') && method === 'POST') {
        totalXp = 190;
        return (
          completeResponse?.() ??
          json(200, {
            completion: {
              blockId: BLOCK_1,
              occurrenceDate: '2026-10-07',
              completedAt: '2026-10-07T13:00:00.000Z',
              xpAmount: 90,
            },
            alreadyCompleted: false,
            xpAwarded: 90,
            levelBefore: 2,
            levelAfter: 2,
            total: level(190, 2),
            area: { areaId: AREA, ...level(190, 2) },
          })
        );
      }
      if (url.endsWith('/completion') && method === 'DELETE') {
        return json(200, { xpReverted: 90, total: level(100, 2), area: null });
      }
      if (url.includes('/exceptions/')) {
        if (method === 'DELETE') return new Response(null, { status: 204 });
        return json(200, {
          blockId: BLOCK_1,
          occurrenceDate: '2026-10-07',
          type: 'skip',
          newDate: null,
          newStartTime: null,
          newDurationMin: null,
        });
      }
      return json(404);
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <HudProbe />
      <TodayPage />
    </QueryClientProvider>,
  );
  return { calls };
}

/** Faz o papel do HUD do AppShell: lê o progresso, que concluir/desfazer precisa atualizar. */
function HudProbe() {
  const character = useCharacter();
  return <p data-testid="hud">{character.xp} XP</p>;
}

const card = (name: string) => screen.findByRole('article', { name: new RegExp(`^${name}`) });

describe('TodayPage', () => {
  beforeEach(() => {
    setAccessToken('token');
    toast.success.mockClear();
    toast.error.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('mostra os blocos de hoje, o XP do dia e o nível', async () => {
    setup({ items: [makeItem(BLOCK_1)] });

    expect(await card('Corrida')).toBeInTheDocument();
    expect(screen.getByText('Quarta-feira, 7 de outubro de 2026')).toBeInTheDocument();
    expect(screen.getByText('+90')).toBeInTheDocument();
    expect(screen.getByText('0 de 1 concluídos')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Nível 2' })).toBeInTheDocument();
  });

  it('mostra o streak e o recorde no resumo do dia', async () => {
    setup({ items: [makeItem(BLOCK_1)] });

    expect(await screen.findByText('Streak: 3 dias · recorde 7')).toBeInTheDocument();
  });

  it('no singular e sem recorde ainda, não mostra "recorde"', async () => {
    setup({
      items: [makeItem(BLOCK_1)],
      streak: { current: 1, best: 0, lastFulfilledDate: null },
    });

    expect(await screen.findByText('Streak: 1 dia')).toBeInTheDocument();
  });

  it('em dia livre avisa que o streak não muda', async () => {
    setup({ items: [] });

    expect(await screen.findByText(/dia livre, seu streak não muda/)).toBeInTheDocument();
  });

  it('destaca só o próximo bloco', async () => {
    setup({
      items: [
        makeItem(BLOCK_1, {
          status: 'completed',
          startTime: '07:00',
          completion: {
            blockId: BLOCK_1,
            occurrenceDate: '2026-10-07',
            completedAt: '2026-10-07T10:00:00.000Z',
            xpAmount: 90,
          },
        }),
        makeItem(BLOCK_2, { activityId: ACT_READ, startTime: '12:00' }),
        makeItem(BLOCK_3, { activityId: ACT_READ, startTime: '20:00', status: 'upcoming' }),
      ],
    });

    await card('Leitura, 12:00');
    expect(screen.getAllByText('Próximo bloco')).toHaveLength(1);
    expect(within(await card('Leitura, 12:00')).getByText('Próximo bloco')).toBeInTheDocument();
  });

  it('conclui: chama a API, mostra o XP ganho e não comemora sem subir de nível', async () => {
    const { calls } = setup({ items: [makeItem(BLOCK_1)] });

    await userEvent.click(within(await card('Corrida')).getByRole('button', { name: /Concluir/ }));

    await waitFor(() =>
      expect(calls).toContainEqual(
        expect.objectContaining({
          method: 'POST',
          url: `/api/blocks/${BLOCK_1}/occurrences/2026-10-07/completion`,
        }),
      ),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('+90 XP', { description: '“Corrida” concluído.' }),
    );
    // a conclusão já foi processada (o aviso saiu); só então vale checar que nada foi comemorado
    expect(screen.queryByText(/Você chegou ao nível/)).not.toBeInTheDocument();
    // e a tela, o HUD e a Semana buscam os dados novos
    await waitFor(() => {
      const gets = (url: string) => calls.filter((c) => c.method === 'GET' && c.url === url);
      expect(gets('/api/today').length).toBeGreaterThanOrEqual(2);
    });
    // o HUD (aqui, a sonda) passa a mostrar o XP novo
    expect(await screen.findByTestId('hud')).toHaveTextContent('190 XP');
  });

  it('o botão Concluir mostra quanto XP rende', async () => {
    setup({ items: [makeItem(BLOCK_1)] });
    expect(await screen.findByRole('button', { name: /Concluir.*\+90 XP/ })).toBeInTheDocument();
  });

  it('comemora quando a conclusão sobe de nível', async () => {
    setup({
      items: [makeItem(BLOCK_1)],
      completeResponse: () =>
        json(200, {
          completion: {
            blockId: BLOCK_1,
            occurrenceDate: '2026-10-07',
            completedAt: '2026-10-07T13:00:00.000Z',
            xpAmount: 90,
          },
          alreadyCompleted: false,
          xpAwarded: 90,
          levelBefore: 2,
          levelAfter: 3,
          total: level(190, 3),
          area: { areaId: AREA, ...level(190, 3) },
        }),
    });

    await userEvent.click(within(await card('Corrida')).getByRole('button', { name: /Concluir/ }));

    expect(await screen.findByText('Você chegou ao nível 3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() =>
      expect(screen.queryByText('Você chegou ao nível 3')).not.toBeInTheDocument(),
    );
  });

  it('concluir de novo (já concluído) não mostra XP novo nem comemora', async () => {
    setup({
      items: [makeItem(BLOCK_1)],
      completeResponse: () =>
        json(200, {
          completion: {
            blockId: BLOCK_1,
            occurrenceDate: '2026-10-07',
            completedAt: '2026-10-07T13:00:00.000Z',
            xpAmount: 90,
          },
          alreadyCompleted: true,
          xpAwarded: 0,
          levelBefore: 3,
          levelAfter: 3,
          total: level(190, 3),
          area: { areaId: AREA, ...level(190, 3) },
        }),
    });

    await userEvent.click(within(await card('Corrida')).getByRole('button', { name: /Concluir/ }));

    await waitFor(() => expect(screen.getByRole('button', { name: /Concluir/ })).toBeEnabled());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('desfaz uma conclusão e avisa o XP devolvido', async () => {
    const { calls } = setup({
      items: [
        makeItem(BLOCK_1, {
          status: 'completed',
          completion: {
            blockId: BLOCK_1,
            occurrenceDate: '2026-10-07',
            completedAt: '2026-10-07T13:00:00.000Z',
            xpAmount: 90,
          },
        }),
      ],
    });

    await userEvent.click(within(await card('Corrida')).getByRole('button', { name: /Desfazer/ }));

    await waitFor(() =>
      expect(calls).toContainEqual(
        expect.objectContaining({
          method: 'DELETE',
          url: `/api/blocks/${BLOCK_1}/occurrences/2026-10-07/completion`,
        }),
      ),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Conclusão de “Corrida” desfeita', {
        description: '90 XP devolvidos.',
      }),
    );
  });

  it('bloco que ainda não começou não pode ser concluído, mas pode ser pulado', async () => {
    setup({ items: [makeItem(BLOCK_1, { status: 'upcoming', startTime: '20:00' })] });

    const corrida = await card('Corrida');
    expect(within(corrida).queryByRole('button', { name: /Concluir/ })).not.toBeInTheDocument();
    expect(within(corrida).getByText('Libera às 20:00')).toBeInTheDocument();
    expect(within(corrida).getByRole('button', { name: /Pular/ })).toBeInTheDocument();
  });

  it('prazo encerrado não oferece nenhuma ação', async () => {
    setup({ items: [makeItem(BLOCK_1, { status: 'closed' })] });

    const corrida = await card('Corrida');
    expect(within(corrida).queryAllByRole('button')).toHaveLength(0);
    expect(within(corrida).getByText('Prazo encerrado')).toBeInTheDocument();
  });

  it('pula com o endpoint de exceção e oferece Restaurar no pulado', async () => {
    const { calls } = setup({ items: [makeItem(BLOCK_1)] });

    await userEvent.click(within(await card('Corrida')).getByRole('button', { name: /Pular/ }));

    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'PUT',
        url: `/api/blocks/${BLOCK_1}/exceptions/2026-10-07`,
        body: { type: 'skip' },
      }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('“Corrida” pulado nesta data', {
        description: 'Sem XP e sem penalidade. A série continua.',
      }),
    );
    // pular muda os dias planejados, então o progresso (streak) também é buscado de novo
    await waitFor(() =>
      expect(calls.filter((c) => c.method === 'GET' && c.url === '/api/progress').length).toBe(2),
    );
    // a lista de hoje é buscada de novo para refletir o pulado
    await waitFor(() =>
      expect(calls.filter((c) => c.method === 'GET' && c.url === '/api/today').length).toBe(2),
    );
  });

  it('pulado mostra Restaurar e fica fora da contagem do dia', async () => {
    setup({
      items: [
        makeItem(BLOCK_1, { status: 'skipped', skipped: true }),
        makeItem(BLOCK_2, { activityId: ACT_READ, startTime: '12:00' }),
      ],
    });

    const corrida = await card('Corrida');
    expect(within(corrida).getByRole('button', { name: /Restaurar/ })).toBeInTheDocument();
    expect(screen.getByText('0 de 1 concluídos')).toBeInTheDocument();
  });

  it('separa “De ontem (ainda dá tempo)” dos blocos de hoje', async () => {
    setup({
      items: [
        makeItem(BLOCK_1, { date: '2026-10-06', occurrenceDate: '2026-10-06', startTime: '21:00' }),
        makeItem(BLOCK_2, { activityId: ACT_READ }),
      ],
    });

    expect(
      await screen.findByRole('heading', { name: 'De ontem (ainda dá tempo)' }),
    ).toBeInTheDocument();
    const carryover = screen.getByRole('heading', {
      name: 'De ontem (ainda dá tempo)',
    }).parentElement!;
    expect(within(carryover).getByRole('article', { name: /^Corrida/ })).toBeInTheDocument();
    expect(within(carryover).queryByRole('article', { name: /^Leitura/ })).not.toBeInTheDocument();
    // o de ontem não leva o destaque de "próximo bloco"; o de hoje, sim
    expect(within(await card('Leitura')).getByText('Próximo bloco')).toBeInTheDocument();
    expect(within(carryover).queryByText('Próximo bloco')).not.toBeInTheDocument();
  });

  it('busca a lista de novo a cada minuto: o que não tinha começado passa a poder ser concluído', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { calls } = setup({ items: [makeItem(BLOCK_1)] });
      await card('Corrida');
      const todayCalls = () => calls.filter((c) => c.url === '/api/today').length;
      expect(todayCalls()).toBe(1);

      await vi.advanceTimersByTimeAsync(60_000);

      await waitFor(() => expect(todayCalls()).toBe(2));
    } finally {
      vi.useRealTimers();
    }
  });

  it('sem blocos, explica e não mostra a seção de ontem', async () => {
    setup({ items: [] });

    expect(await screen.findByText(/Nenhum bloco planejado para hoje/)).toBeInTheDocument();
    expect(screen.queryByText('De ontem (ainda dá tempo)')).not.toBeInTheDocument();
  });

  it('mostra o erro do servidor num aviso e destrava o botão', async () => {
    setup({
      items: [makeItem(BLOCK_1)],
      completeResponse: () => json(409, { message: 'O prazo para concluir terminou' }),
    });

    await userEvent.click(within(await card('Corrida')).getByRole('button', { name: /Concluir/ }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('O prazo para concluir terminou'));
    expect(screen.getByRole('button', { name: /Concluir/ })).toBeEnabled();
  });
});
