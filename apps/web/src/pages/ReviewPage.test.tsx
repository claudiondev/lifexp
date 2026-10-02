import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewDetail, ReviewListItem, User, WeekSummary } from '@lifexp/shared';
import { AuthContext, type AuthContextValue } from '@/features/auth/AuthContext';
import { json } from '@/features/goals/testing';
import { setAccessToken } from '@/lib/apiClient';
import { ReviewPage } from './ReviewPage';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast, Toaster: () => null }));

const NOW = new Date('2026-10-07T18:00:00.000Z'); // quarta 15:00 em São Paulo; semana atual = 2026-10-05
const WEEK = '2026-10-05';
const area = (n: number) => `0192f1a0-7b3c-7000-8000-00000000000${n}`;

const USER = {
  id: area(9),
  name: 'Ana',
  email: 'ana@test.dev',
  timezone: 'America/Sao_Paulo',
  avatarKey: 'swords',
  createdAt: '2026-01-01T00:00:00.000Z',
} as User;

const summary = (weekStart = WEEK, over: Partial<WeekSummary> = {}): WeekSummary => ({
  weekStart,
  weekEnd: '2026-10-11',
  totals: {
    planned: 4,
    completed: 3,
    plannedMin: 240,
    completedMin: 150,
    skipped: 1,
    adherence: 0.75,
    xp: 150,
  },
  areas: [
    {
      areaId: area(1),
      name: 'Saúde',
      color: 'moss',
      icon: 'heart-pulse',
      planned: 3,
      completed: 3,
      plannedMin: 150,
      completedMin: 150,
      adherence: 1,
    },
    {
      areaId: area(2),
      name: 'Trabalho',
      color: 'violet',
      icon: 'briefcase',
      planned: 1,
      completed: 0,
      plannedMin: 90,
      completedMin: 0,
      adherence: 0,
    },
  ],
  ...over,
});

const emptySummary = (weekStart: string): WeekSummary =>
  summary(weekStart, {
    totals: {
      planned: 0,
      completed: 0,
      plannedMin: 0,
      completedMin: 0,
      skipped: 0,
      adherence: null,
      xp: 0,
    },
    areas: [],
  });

interface Api {
  details?: Record<string, Partial<ReviewDetail>>;
  history?: ReviewListItem[];
  detailStatus?: number;
  putStatus?: number;
}

function setup(entry = '/revisao', api: Api = {}) {
  const saved: Record<string, { wins: string; blockers: string; nextPriority: string }> = {};
  const calls: { method: string; url: string; body?: unknown }[] = [];
  const history = [...(api.history ?? [])].sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url, body });

      const week = /^\/api\/reviews\/(\d{4}-\d{2}-\d{2})$/.exec(url);
      if (week && method === 'GET') {
        if (api.detailStatus) return json(api.detailStatus, { message: 'falhou' });
        const key = week[1]!;
        const custom = api.details?.[key];
        const own = saved[key];
        const review = own
          ? { weekStart: key, ...own, updatedAt: NOW.toISOString() }
          : (custom?.review ?? null);
        return json(200, {
          summary: custom?.summary ?? summary(key),
          review,
          previousPriority: custom?.previousPriority ?? null,
        });
      }
      if (week && method === 'PUT') {
        if (api.putStatus) return json(api.putStatus, { message: 'Esta semana ainda não começou' });
        saved[week[1]!] = body;
        return json(200, { weekStart: week[1], ...body, updatedAt: NOW.toISOString() });
      }
      if (url.startsWith('/api/reviews?')) {
        const params = new URL(url, 'http://x').searchParams;
        const limit = Number(params.get('limit'));
        const before = params.get('before');
        const rows = history.filter((item) => !before || item.weekStart < before);
        const items = rows.slice(0, limit);
        return json(200, {
          items,
          nextCursor: rows.length > limit ? items[items.length - 1]!.weekStart : null,
        });
      }
      return json(404);
    }),
  );

  let where = '';
  function Where() {
    const location = useLocation();
    where = `${location.pathname}${location.search}`;
    return null;
  }
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
        <MemoryRouter initialEntries={[entry]}>
          <ReviewPage />
          <Where />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
  return { calls, where: () => where };
}

const reviewCalls = (calls: { method: string; url: string }[]) =>
  calls
    .filter((call) => /^\/api\/reviews\/\d/.test(call.url) && call.method === 'GET')
    .map((c) => c.url);

describe('ReviewPage', () => {
  beforeEach(() => {
    setAccessToken('token');
    toast.success.mockClear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('resumo da semana', () => {
    it('mostra o intervalo, os totais e a aderência por área, sem tom de cobrança', async () => {
      setup();

      expect(await screen.findByText('5 – 11 out 2026 · esta semana')).toBeInTheDocument();
      const blocks = (await screen.findByText('Blocos')).closest('div')!;
      expect(blocks).toHaveTextContent('75%');
      expect(blocks).toHaveTextContent('3 de 4 blocos cumpridos');
      expect(screen.getByText('Tempo').closest('div')).toHaveTextContent('2 h 30 min de 4 h');
      expect(screen.getByText('XP da semana').closest('div')).toHaveTextContent('+150 XP');
      expect(
        screen.getByText('1 bloco foi pulado. Pular não pesa na sua aderência.'),
      ).toBeInTheDocument();

      const health = screen.getByRole('progressbar', { name: 'Aderência em Saúde' });
      expect(health).toHaveAttribute('aria-valuenow', '100');
      expect(health).toHaveAttribute('aria-valuetext', '3 de 3 blocos cumpridos');
      const work = screen.getByRole('progressbar', { name: 'Aderência em Trabalho' });
      expect(work).toHaveAttribute('aria-valuenow', '0');
      expect(screen.getByText('0 de 1 bloco cumprido · 0 min de 1 h 30 min')).toBeInTheDocument();
      // nada de alerta vermelho para uma área sem cumprimento
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('semana sem nada planejado diz isso e não mostra totais', async () => {
      setup('/revisao', { details: { [WEEK]: { summary: emptySummary(WEEK) } } });

      expect(await screen.findByText('Nenhum bloco planejado nesta semana.')).toBeInTheDocument();
      expect(screen.queryByText('Blocos')).not.toBeInTheDocument();
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('semana só de pulados e com XP: explica sem culpa', async () => {
      const s = emptySummary(WEEK);
      setup('/revisao', {
        details: {
          [WEEK]: {
            summary: { ...s, totals: { ...s.totals, skipped: 2, xp: -60 } },
          },
        },
      });
      expect(await screen.findByText('Nenhum bloco planejado nesta semana.')).toBeInTheDocument();
      expect(screen.getByText(/2 blocos foram pulados/)).toBeInTheDocument();
      expect(screen.getByText('XP da semana: −60 XP')).toBeInTheDocument();
    });

    it('mostra a prioridade combinada na semana anterior, e só quando existe', async () => {
      setup('/revisao', { details: { [WEEK]: { previousPriority: 'Fechar o TCC' } } });
      const callout = await screen.findByRole('complementary', { name: 'Prioridade combinada' });
      expect(callout).toHaveTextContent('Você escolheu como prioridade para esta semana');
      expect(callout).toHaveTextContent('Fechar o TCC');
    });

    it('sem prioridade anterior, não aparece o aviso', async () => {
      setup();
      await screen.findByText('Como foi a semana');
      expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    });

    it('falha ao carregar mostra o erro e permite tentar de novo', async () => {
      setup('/revisao', { detailStatus: 500 });
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Não foi possível carregar a revisão desta semana.',
      );
      expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
    });
  });

  describe('reflexão', () => {
    const typeInto = async (label: string, text: string) => {
      const field = screen.getByLabelText(label);
      await userEvent.clear(field);
      await userEvent.type(field, text);
    };

    it('traz as três perguntas, vazias, e o botão de salvar bloqueado até haver mudança', async () => {
      setup();
      await screen.findByText('Sua reflexão');

      expect(screen.getByLabelText('O que deu certo?')).toHaveValue('');
      expect(screen.getByLabelText('O que travou?')).toHaveValue('');
      expect(screen.getByLabelText('Qual a prioridade da próxima semana?')).toHaveValue('');
      expect(screen.getByRole('button', { name: 'Salvar revisão' })).toBeDisabled();
      expect(screen.queryByText('Tudo salvo')).not.toBeInTheDocument();
    });

    it('mostra a reflexão já salva e conta os caracteres', async () => {
      setup('/revisao', {
        details: {
          [WEEK]: {
            review: {
              weekStart: WEEK,
              wins: 'Corri',
              blockers: 'Choveu',
              nextPriority: 'Foco',
              updatedAt: NOW.toISOString(),
            },
          },
        },
      });
      await screen.findByText('Sua reflexão');
      expect(screen.getByLabelText('O que deu certo?')).toHaveValue('Corri');
      expect(screen.getByText('5/2000')).toBeInTheDocument();
      expect(screen.getByText('Tudo salvo')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Salvar revisão' })).toBeDisabled();
    });

    it('salva os três campos de uma vez, avisa e passa a mostrar "Tudo salvo"', async () => {
      const { calls } = setup();
      await screen.findByText('Sua reflexão');

      await typeInto('O que deu certo?', 'Corri 3 vezes');
      await typeInto('O que travou?', 'Choveu');
      await typeInto('Qual a prioridade da próxima semana?', 'Entregar o relatório');
      expect(screen.getByRole('button', { name: 'Salvar revisão' })).toBeEnabled();
      await userEvent.click(screen.getByRole('button', { name: 'Salvar revisão' }));

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Revisão salva'));
      expect(calls.filter((call) => call.method === 'PUT')).toEqual([
        {
          method: 'PUT',
          url: `/api/reviews/${WEEK}`,
          body: { wins: 'Corri 3 vezes', blockers: 'Choveu', nextPriority: 'Entregar o relatório' },
        },
      ]);
      expect(await screen.findByText('Tudo salvo')).toBeInTheDocument();
    });

    it('apagar um texto salvo também é uma mudança que pode ser salva', async () => {
      const { calls } = setup('/revisao', {
        details: {
          [WEEK]: {
            review: {
              weekStart: WEEK,
              wins: 'Corri',
              blockers: '',
              nextPriority: '',
              updatedAt: NOW.toISOString(),
            },
          },
        },
      });
      await screen.findByText('Sua reflexão');
      await userEvent.clear(screen.getByLabelText('O que deu certo?'));
      await userEvent.click(screen.getByRole('button', { name: 'Salvar revisão' }));

      await waitFor(() => expect(calls.some((call) => call.method === 'PUT')).toBe(true));
      expect(calls.find((call) => call.method === 'PUT')!.body).toEqual({
        wins: '',
        blockers: '',
        nextPriority: '',
      });
    });

    it('o campo não aceita mais de 2000 caracteres', async () => {
      setup();
      await screen.findByText('Sua reflexão');
      expect(screen.getByLabelText('O que deu certo?')).toHaveAttribute('maxlength', '2000');
    });

    it('erro do servidor aparece e o texto digitado continua lá', async () => {
      setup('/revisao', { putStatus: 400 });
      await screen.findByText('Sua reflexão');
      await typeInto('O que deu certo?', 'Corri');

      await userEvent.click(screen.getByRole('button', { name: 'Salvar revisão' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Esta semana ainda não começou');
      expect(toast.success).not.toHaveBeenCalled();
      expect(screen.getByLabelText('O que deu certo?')).toHaveValue('Corri');
      expect(screen.getByRole('button', { name: 'Salvar revisão' })).toBeEnabled();
    });
  });

  describe('navegação entre semanas', () => {
    it('semana atual: "Esta semana" e "Próxima semana" ficam bloqueados', async () => {
      setup();
      await screen.findByText('Como foi a semana');
      expect(screen.getByRole('button', { name: 'Esta semana' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Próxima semana' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Semana anterior' })).toBeEnabled();
    });

    it('anda para trás e para frente, guarda a semana na URL e busca cada uma', async () => {
      const { calls, where } = setup();
      await screen.findByText('5 – 11 out 2026 · esta semana');

      await userEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
      expect(await screen.findByText('28 set – 4 out 2026')).toBeInTheDocument();
      expect(where()).toBe('/revisao?semana=2026-09-28');
      expect(screen.getByRole('button', { name: 'Próxima semana' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Esta semana' })).toBeEnabled();

      await userEvent.click(screen.getByRole('button', { name: 'Próxima semana' }));
      expect(await screen.findByText('5 – 11 out 2026 · esta semana')).toBeInTheDocument();
      expect(where()).toBe('/revisao');
      expect(reviewCalls(calls)).toContain('/api/reviews/2026-09-28');
    });

    it('"Esta semana" volta direto, sem passar pelas outras', async () => {
      const { where } = setup('/revisao?semana=2026-08-31');
      expect(await screen.findByText('31 ago – 6 set 2026')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Esta semana' }));

      expect(await screen.findByText('5 – 11 out 2026 · esta semana')).toBeInTheDocument();
      expect(where()).toBe('/revisao');
    });

    it('uma data no meio da semana vira a segunda-feira dela', async () => {
      const { calls } = setup('/revisao?semana=2026-09-30');
      expect(await screen.findByText('28 set – 4 out 2026')).toBeInTheDocument();
      expect(reviewCalls(calls)).toEqual(['/api/reviews/2026-09-28']);
    });

    it('voltando a uma semana já carregada, o formulário traz o texto dela e descarta o rascunho da outra', async () => {
      setup('/revisao', {
        details: {
          '2026-09-28': {
            review: {
              weekStart: '2026-09-28',
              wins: 'da semana passada',
              blockers: '',
              nextPriority: '',
              updatedAt: NOW.toISOString(),
            },
          },
        },
      });
      await screen.findByText('Sua reflexão');
      // carrega as duas semanas (as duas ficam em cache)
      await userEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
      await waitFor(() =>
        expect(screen.getByLabelText('O que deu certo?')).toHaveValue('da semana passada'),
      );
      await userEvent.click(screen.getByRole('button', { name: 'Próxima semana' }));
      await screen.findByText('5 – 11 out 2026 · esta semana');
      await userEvent.type(screen.getByLabelText('O que deu certo?'), 'rascunho da atual');

      // agora as duas estão em cache: a troca é instantânea, sem passar pelo carregamento
      await userEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));

      expect(screen.getByLabelText('O que deu certo?')).toHaveValue('da semana passada');
    });

    it('semana futura na URL volta para a atual, sem pedir a semana futura ao servidor', async () => {
      const { calls } = setup('/revisao?semana=2026-12-07');
      expect(await screen.findByText('5 – 11 out 2026 · esta semana')).toBeInTheDocument();
      expect(reviewCalls(calls)).toEqual([`/api/reviews/${WEEK}`]);
    });

    it('valor inválido na URL vira a semana atual', async () => {
      const { calls } = setup('/revisao?semana=abc');
      expect(await screen.findByText('5 – 11 out 2026 · esta semana')).toBeInTheDocument();
      expect(reviewCalls(calls)).toEqual([`/api/reviews/${WEEK}`]);
    });

    it('ao trocar de semana, o formulário mostra o texto daquela semana, não o da anterior', async () => {
      setup('/revisao', {
        details: {
          '2026-09-28': {
            review: {
              weekStart: '2026-09-28',
              wins: 'da semana passada',
              blockers: '',
              nextPriority: '',
              updatedAt: NOW.toISOString(),
            },
          },
        },
      });
      await screen.findByText('Sua reflexão');
      await userEvent.type(screen.getByLabelText('O que deu certo?'), 'rascunho desta');

      await userEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));

      await waitFor(() =>
        expect(screen.getByLabelText('O que deu certo?')).toHaveValue('da semana passada'),
      );
    });
  });

  it('perto da virada, a semana atual é a do fuso da pessoa, não a do UTC', async () => {
    // segunda 02:00 em UTC, mas ainda domingo 23:00 em São Paulo: a semana atual segue sendo a de 5/10
    vi.setSystemTime(new Date('2026-10-12T02:00:00.000Z'));
    const { calls } = setup();

    expect(await screen.findByText('5 – 11 out 2026 · esta semana')).toBeInTheDocument();
    expect(reviewCalls(calls)).toEqual([`/api/reviews/${WEEK}`]);
  });

  describe('revisões anteriores', () => {
    const item = (weekStart: string, nextPriority = ''): ReviewListItem => ({
      weekStart,
      nextPriority,
      updatedAt: NOW.toISOString(),
    });

    const historySection = () => screen.findByRole('region', { name: 'Revisões anteriores' });
    const historyLinks = async () => within(await historySection()).findAllByRole('link');

    it('sem nenhuma revisão escrita, explica', async () => {
      setup();
      expect(await screen.findByText(/Suas revisões escritas aparecem aqui/)).toBeInTheDocument();
    });

    it('lista as semanas com a prioridade e abre a semana ao clicar', async () => {
      const { where } = setup('/revisao', {
        history: [item('2026-09-28', 'Fechar o TCC'), item('2026-09-21')],
      });

      const links = await historyLinks();
      expect(links).toHaveLength(2);
      expect(links[0]).toHaveTextContent('28 set – 4 out 2026');
      expect(links[0]).toHaveTextContent('Prioridade: Fechar o TCC');
      expect(links[1]).toHaveTextContent('21 – 27 set 2026');
      expect(links[1]).not.toHaveTextContent('Prioridade');
      expect(links[0]).toHaveAttribute('href', '/revisao?semana=2026-09-28');

      await userEvent.click(links[0]!);
      await waitFor(() => expect(where()).toBe('/revisao?semana=2026-09-28'));
      // o cabeçalho passa a mostrar a semana aberta (o mesmo texto também está no histórico)
      expect(
        within(screen.getByRole('banner')).getByText('28 set – 4 out 2026'),
      ).toBeInTheDocument();
    });

    it('"Carregar mais" traz a página seguinte pelo cursor e some no fim', async () => {
      const many = Array.from({ length: 13 }, (_, index) => {
        const day = new Date(Date.UTC(2026, 6, 6 + index * 7)); // segundas-feiras
        return item(day.toISOString().slice(0, 10), `Foco ${index}`);
      });
      const { calls } = setup('/revisao', { history: many });

      await screen.findByText(/Foco 12/);
      expect(await historyLinks()).toHaveLength(10);

      await userEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));

      await waitFor(async () => expect(await historyLinks()).toHaveLength(13));
      expect(calls.at(-1)!.url).toContain('before=');
      expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument();
    });
  });
});
