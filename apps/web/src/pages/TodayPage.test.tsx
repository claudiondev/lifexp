import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
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
    note: null,
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
  /** Eventos de calendário do dia (a tela Hoje os mostra como informativos). */
  events?: unknown[];
  eventsStatus?: number;
  /** Resposta do POST de conclusão; padrão: ganhou 90 XP sem subir de nível. */
  completeResponse?: () => Response;
  streak?: {
    current: number;
    best: number;
    lastFulfilledDate: string | null;
    joker?: { weekStart: string; used: boolean; usedOn: string | null };
  };
  /** Resposta de GET /api/quest; sem ela a rota falha (404) e a tela segue sem o cartão. */
  quest?: unknown;
  /** Resposta do DELETE de conclusão; padrão: 90 XP devolvidos, sem mexer na quest. */
  undoResponse?: () => Response;
}

function setup({
  items,
  events = [],
  eventsStatus,
  completeResponse,
  quest,
  undoResponse,
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
      if (url.startsWith('/api/events?')) {
        calls.push({ method, url });
        return eventsStatus ? json(eventsStatus, { message: 'falhou' }) : json(200, events);
      }
      if (url === '/api/quest') return quest ? json(200, quest) : json(404);
      if (url === '/api/progress')
        return json(200, {
          total: level(totalXp, 2),
          areas: [],
          streak: { joker: { weekStart: '2026-10-05', used: false, usedOn: null }, ...streak },
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
        return undoResponse?.() ?? json(200, { xpReverted: 90, total: level(100, 2), area: null });
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
      <MemoryRouter>
        <HudProbe />
        <TodayPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { calls };
}

/** Faz o papel do HUD do AppShell: lê o progresso, que concluir/desfazer precisa atualizar. */
function HudProbe() {
  const character = useCharacter();
  return <p data-testid="hud">{character.xp} XP</p>;
}

const activeQuest = {
  weekStart: '2026-10-05',
  status: 'active',
  eligible: 5,
  completed: 1,
  target: 4,
  ratio: 0.2,
  bonusXp: 120,
  tiers: [
    { percent: 80, requiredCount: 4, reached: false },
    { percent: 90, requiredCount: 5, reached: false },
    { percent: 100, requiredCount: 5, reached: false },
  ],
  completedAt: null,
};

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

  it('mostra a anotação do bloco no cartão, como texto puro', async () => {
    setup({ items: [makeItem(BLOCK_1, { note: 'Aula de inglês <b>lição 5</b>' })] });

    const article = await card('Corrida');
    expect(within(article).getByText('Aula de inglês <b>lição 5</b>')).toBeInTheDocument();
    expect(article.querySelector('b')).toBeNull();
  });

  it('bloco sem anotação não ganha linha extra', async () => {
    setup({ items: [makeItem(BLOCK_1)] });

    const article = await card('Corrida');
    expect(article.querySelector('p.line-clamp-2')).toBeNull();
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

  it('mostra o coringa da semana: disponível ou usado', async () => {
    setup({ items: [makeItem(BLOCK_1)] });
    expect(
      await screen.findByText(/Coringa da semana disponível: ele perdoa o primeiro dia perdido/),
    ).toBeInTheDocument();
  });

  it('com o coringa usado, diz qual dia ele protegeu', async () => {
    setup({
      items: [makeItem(BLOCK_1)],
      streak: {
        current: 3,
        best: 7,
        lastFulfilledDate: '2026-10-06',
        joker: { weekStart: '2026-10-05', used: true, usedOn: '2026-10-06' },
      },
    });
    expect(
      await screen.findByText(
        'Coringa da semana usado em terça-feira (06/10): sua sequência foi protegida.',
      ),
    ).toBeInTheDocument();
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

  describe('conquistas e recompensas', () => {
    it('concluir um bloco que desbloqueia conquista e recompensa avisa dos dois', async () => {
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
            levelAfter: 2,
            total: level(190, 2),
            area: { areaId: AREA, ...level(190, 2) },
            achievementsUnlocked: ['first_step', 'constant'],
            rewardsReached: [{ id: '0192f1a0-7b3c-7000-8000-0000000000e1', title: 'Sorvete' }],
          }),
      });
      await userEvent.click(
        within(await card('Corrida')).getByRole('button', { name: /Concluir/ }),
      );

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith('Conquista desbloqueada: Primeiro passo', {
          description: 'Cumpra o seu primeiro bloco.',
        }),
      );
      expect(toast.success).toHaveBeenCalledWith(
        'Conquista desbloqueada: Constante',
        expect.anything(),
      );
      expect(toast.success).toHaveBeenCalledWith('Recompensa desbloqueada: Sorvete', {
        description: 'Você pode resgatá-la em Recompensas.',
      });
    });

    it('concluir de novo (já concluído) não avisa de nada, mesmo que a resposta traga algo', async () => {
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
            levelBefore: 2,
            levelAfter: 2,
            total: level(190, 2),
            area: { areaId: AREA, ...level(190, 2) },
            achievementsUnlocked: ['first_step'],
          }),
      });
      await userEvent.click(
        within(await card('Corrida')).getByRole('button', { name: /Concluir/ }),
      );
      await waitFor(() =>
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/completion'),
          expect.anything(),
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(toast.success).not.toHaveBeenCalled();
    });
  });

  describe('quest da semana', () => {
    it('mostra o cartão com o que falta e o bônus', async () => {
      setup({ items: [makeItem(BLOCK_1)], quest: activeQuest });

      const section = await screen.findByRole('region', { name: 'Quest da semana' });
      expect(within(section).getByText(/Faltam 3 blocos para o bônus de 120 XP/)).toBeVisible();
      expect(within(section).getByText('+120 XP')).toBeVisible();
    });

    it('sem quest na semana (ou com a rota falhando), a tela segue sem o cartão', async () => {
      setup({ items: [makeItem(BLOCK_1)], quest: { ...activeQuest, status: 'none' } });
      await card('Corrida');
      expect(screen.queryByRole('region', { name: 'Quest da semana' })).not.toBeInTheDocument();
    });

    it('a rota falhando não derruba a tela nem mostra erro', async () => {
      setup({ items: [makeItem(BLOCK_1)] });
      await card('Corrida');
      expect(screen.queryByRole('region', { name: 'Quest da semana' })).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('concluir o bloco que cumpre a quest comemora o bônus e atualiza o cartão', async () => {
      const { calls } = setup({
        items: [makeItem(BLOCK_1)],
        quest: activeQuest,
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
            questBonusXp: 120,
            levelBefore: 2,
            levelAfter: 2,
            total: level(310, 2),
            area: { areaId: AREA, ...level(310, 2) },
          }),
      });
      await userEvent.click(
        within(await card('Corrida')).getByRole('button', { name: /Concluir/ }),
      );

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith('Quest da semana cumprida! +120 XP de bônus'),
      );
      await waitFor(() => {
        const gets = calls.filter((c) => c.method === 'GET' && c.url === '/api/quest');
        expect(gets.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('concluir sem cumprir a quest não mostra aviso de bônus', async () => {
      setup({ items: [makeItem(BLOCK_1)], quest: activeQuest });
      await userEvent.click(
        within(await card('Corrida')).getByRole('button', { name: /Concluir/ }),
      );

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith('+90 XP', {
          description: '“Corrida” concluído.',
        }),
      );
      expect(toast.success).toHaveBeenCalledTimes(1);
    });

    it('desfazer que derruba a quest avisa do bônus devolvido, sem culpa', async () => {
      setup({
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
        quest: activeQuest,
        undoResponse: () =>
          json(200, {
            xpReverted: 90,
            questBonusReverted: 120,
            total: level(100, 2),
            area: null,
          }),
      });
      await userEvent.click(
        within(await card('Corrida')).getByRole('button', { name: /Desfazer/ }),
      );

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith(
          'A quest da semana voltou a ficar em andamento',
          {
            description: '120 XP de bônus devolvidos. Conclua de novo para recuperar.',
          },
        ),
      );
    });

    it('pular um bloco busca a quest de novo (sai da conta)', async () => {
      const { calls } = setup({ items: [makeItem(BLOCK_1)], quest: activeQuest });
      await userEvent.click(within(await card('Corrida')).getByRole('button', { name: /Pular/ }));

      await waitFor(() => {
        const gets = calls.filter((c) => c.method === 'GET' && c.url === '/api/quest');
        expect(gets.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('desfazer sem mexer na quest não fala dela', async () => {
      setup({
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
        quest: activeQuest,
      });
      await userEvent.click(
        within(await card('Corrida')).getByRole('button', { name: /Desfazer/ }),
      );

      await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    });
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

  describe('eventos do calendário', () => {
    const consulta = {
      id: '0192f1a0-7b3c-7000-8000-00000000e001',
      areaId: null,
      title: 'Consulta',
      notes: null,
      date: '2026-10-07',
      time: '14:30',
      category: 'medical',
      remindBeforeMin: 60,
    };

    it('mostra os eventos do dia, como informativos, antes dos blocos', async () => {
      const { calls } = setup({ items: [makeItem(BLOCK_1)], events: [consulta] });

      const heading = await screen.findByRole('heading', { name: 'Eventos de hoje' });
      expect(
        await screen.findByRole('button', { name: 'Evento: Consulta, 14:30' }),
      ).toBeInTheDocument();
      expect(screen.getByText(/Eventos não rendem XP/)).toBeInTheDocument();
      expect(calls.map((c) => c.url)).toContain('/api/events?from=2026-10-07&to=2026-10-07');
      // vem antes de "Blocos de hoje"
      const blocks = screen.getByRole('heading', { name: 'Blocos de hoje' });
      expect(
        heading.compareDocumentPosition(blocks) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      // e nenhum botão de concluir no evento
      expect(
        within(screen.getByRole('button', { name: /Evento: Consulta/ })).queryByText(/Concluir/),
      ).not.toBeInTheDocument();
    });

    it('ordena: dia todo primeiro, depois por horário (mesmo que a API devolva fora de ordem)', async () => {
      setup({
        items: [makeItem(BLOCK_1)],
        events: [
          {
            ...consulta,
            id: '0192f1a0-7b3c-7000-8000-00000000e002',
            title: 'Noite',
            time: '20:00',
          },
          { ...consulta, id: '0192f1a0-7b3c-7000-8000-00000000e003', title: 'Cedo', time: '07:00' },
          {
            ...consulta,
            id: '0192f1a0-7b3c-7000-8000-00000000e004',
            title: 'Dia todo',
            time: null,
            remindBeforeMin: 1440,
          },
        ],
      });

      await screen.findByRole('button', { name: /Evento: Cedo/ });
      const titles = screen
        .getAllByRole('button', { name: /^Evento: / })
        .map((button) => button.getAttribute('aria-label')!.split(',')[0]);
      expect(titles).toEqual(['Evento: Dia todo', 'Evento: Cedo', 'Evento: Noite']);
    });

    it('não consulta eventos antes de saber a data de hoje', async () => {
      const { calls } = setup({ items: [makeItem(BLOCK_1)], events: [consulta] });
      await screen.findByRole('button', { name: /Evento: Consulta/ });

      expect(calls.map((c) => c.url).filter((url) => url.includes('from=&'))).toEqual([]);
    });

    it('editar um evento fecha o painel de detalhes e abre o formulário com os dados', async () => {
      setup({ items: [makeItem(BLOCK_1)], events: [consulta] });

      await userEvent.click(await screen.findByRole('button', { name: /Evento: Consulta/ }));
      await userEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: 'Editar' }),
      );

      expect(await screen.findByText('Editar evento')).toBeInTheDocument();
      expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
      expect(within(screen.getByRole('dialog')).getByLabelText('Título')).toHaveValue('Consulta');
    });

    it('sem eventos, a seção nem aparece', async () => {
      setup({ items: [makeItem(BLOCK_1)], events: [] });
      await card('Corrida');
      expect(screen.queryByRole('heading', { name: 'Eventos de hoje' })).not.toBeInTheDocument();
    });

    it('se os eventos falharem, as missões continuam funcionando', async () => {
      setup({ items: [makeItem(BLOCK_1)], eventsStatus: 500 });
      expect(await card('Corrida')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Eventos de hoje' })).not.toBeInTheDocument();
    });

    it('clicar no evento abre os detalhes', async () => {
      setup({ items: [makeItem(BLOCK_1)], events: [consulta] });

      await userEvent.click(await screen.findByRole('button', { name: /Evento: Consulta/ }));

      expect(
        within(await screen.findByRole('dialog')).getByRole('heading', { name: 'Consulta' }),
      ).toBeInTheDocument();
    });
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
