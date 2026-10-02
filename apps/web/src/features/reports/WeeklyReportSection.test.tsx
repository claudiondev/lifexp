import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WeeklyReport } from '@lifexp/shared';
import { setAccessToken } from '@/lib/apiClient';
import { WeeklyReportSection } from './WeeklyReportSection';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast, Toaster: () => null }));

const WEEK = '2026-10-05';
const AREA = '0192f1a0-7b3c-7000-8000-0000000000a1';

const report = (over: Partial<WeeklyReport> = {}): WeeklyReport => ({
  weekStart: WEEK,
  weekEnd: '2026-10-11',
  blocks: { planned: 10, completed: 8, skipped: 1, open: 2, adherence: 80 },
  minutes: 495,
  xp: { gained: 700, reverted: 60, net: 640, byArea: [] },
  areas: [],
  quest: {
    weekStart: WEEK,
    status: 'completed',
    eligible: 5,
    completed: 4,
    target: 4,
    ratio: 0.8,
    bonusXp: 120,
    tiers: [],
    completedAt: '2026-10-09T12:00:00.000Z',
  },
  achievements: [{ key: 'constant', title: 'Constante', unlockedAt: '2026-10-08T12:00:00.000Z' }],
  goals: {
    milestones: [
      {
        goalId: AREA,
        goalTitle: 'Escrever o livro',
        title: 'Capítulo 1',
        doneAt: '2026-10-08T12:00:00.000Z',
      },
    ],
    completed: [{ id: AREA, title: 'Correr 5 km', completedAt: '2026-10-08T12:00:00.000Z' }],
  },
  streak: {
    current: 5,
    best: 9,
    lastFulfilledDate: '2026-10-08',
    joker: { weekStart: WEEK, used: true, usedOn: '2026-10-06' },
  },
  bestDay: { date: '2026-10-06', completed: 3 },
  ...over,
});

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup(handler: (url: string) => Response | Promise<Response>) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input) => {
      calls.push(String(input));
      return handler(String(input));
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <WeeklyReportSection weekStart={WEEK} />
    </QueryClientProvider>,
  );
  return { calls, view };
}

describe('WeeklyReportSection', () => {
  beforeEach(() => {
    setAccessToken('token');
    toast.error.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('mostra aderência, blocos, tempo e XP líquido, e o que ficou em aberto e pulado sem cobrança', async () => {
    const { calls } = setup(() => json(200, report()));

    const section = await screen.findByRole('region', { name: 'Relatório da semana' });
    await within(section).findByText('Aderência');
    expect(calls).toContain(`/api/reports/weekly?weekStart=${WEEK}`);
    const tile = (label: string) => within(section).getByText(label).closest('div')!;
    expect(tile('Aderência')).toHaveTextContent('80%');
    expect(tile('Blocos')).toHaveTextContent('8 de 10');
    expect(tile('Tempo')).toHaveTextContent('8 h 15 min');
    expect(tile('XP')).toHaveTextContent('+640');
    expect(tile('XP')).toHaveTextContent('60 devolvidos por desfazer');
    expect(
      within(section).getByText('2 blocos ainda em aberto, com tempo para cumprir.'),
    ).toBeVisible();
    expect(within(section).getByText('1 pulado, sem XP e sem penalidade.')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('mostra quest, sequência com o coringa, melhor dia, conquistas e metas', async () => {
    setup(() => json(200, report()));
    const section = await screen.findByRole('region', { name: 'Relatório da semana' });
    await within(section).findByText('Aderência');

    expect(
      within(section).getByText('Cumprida: 4 de 5 blocos, com bônus de 120 XP.'),
    ).toBeVisible();
    expect(within(section).getByText(/5 dias \(recorde 9\)\./)).toBeVisible();
    expect(
      within(section).getByText(/Coringa da semana usado em terça-feira \(06\/10\)/),
    ).toBeVisible();
    expect(
      within(section).getByText(/Terça-feira|terça-feira, com 3 blocos cumpridos/),
    ).toBeVisible();
    expect(within(section).getByText('Constante')).toBeVisible();
    expect(within(section).getByText('Meta concluída: Correr 5 km')).toBeVisible();
    expect(
      within(section).getByText('Marco concluído: Capítulo 1 (Escrever o livro)'),
    ).toBeVisible();
  });

  it('aderência sem blocos contados aparece como traço, não como 0%', async () => {
    setup(() =>
      json(
        200,
        report({ blocks: { planned: 0, completed: 0, skipped: 0, open: 2, adherence: null } }),
      ),
    );
    const section = await screen.findByRole('region', { name: 'Relatório da semana' });
    expect(await within(section).findByText('Aderência')).toBeVisible();
    expect(within(section).getByText('Aderência').closest('div')).toHaveTextContent('—');
    expect(within(section).queryByText('0%')).not.toBeInTheDocument();
  });

  it('semana sem nenhum bloco: explica, sem números zerados e sem botão de baixar', async () => {
    setup(() =>
      json(
        200,
        report({
          blocks: { planned: 0, completed: 0, skipped: 0, open: 0, adherence: null },
          minutes: 0,
          achievements: [],
          goals: { milestones: [], completed: [] },
          bestDay: null,
        }),
      ),
    );
    const section = await screen.findByRole('region', { name: 'Relatório da semana' });
    expect(await within(section).findByText(/Sem blocos planejados nesta semana/)).toBeVisible();
    expect(within(section).queryByText('Aderência')).not.toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: /Baixar/ })).not.toBeInTheDocument();
  });

  it('se a consulta falhar, a seção some em silêncio', async () => {
    const { view } = setup(() => json(500, { message: 'falhou' }));
    await waitFor(() => expect(view.container.querySelector('section')).toBeNull());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  describe('baixar em Markdown', () => {
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    beforeEach(() => {
      URL.createObjectURL = vi.fn(() => 'blob:fake');
      URL.revokeObjectURL = vi.fn();
    });
    afterEach(() => {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    });

    it('busca o arquivo da semana com a sessão e entrega como download com o nome certo', async () => {
      const clicked: string[] = [];
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        clicked.push(this.download);
      });
      const { calls } = setup((url) =>
        url.includes('.md')
          ? new Response('# Relatório', {
              status: 200,
              headers: { 'Content-Type': 'text/markdown' },
            })
          : json(200, report()),
      );

      await userEvent.click(await screen.findByRole('button', { name: /Baixar em Markdown/ }));

      await waitFor(() => expect(clicked).toEqual([`lifexp-relatorio-${WEEK}.md`]));
      expect(calls).toContain(`/api/reports/weekly.md?weekStart=${WEEK}`);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
      click.mockRestore();
    });

    it('enquanto baixa, o botão fica travado (sem baixar duas vezes)', async () => {
      let finish!: (response: Response) => void;
      const pending = new Promise<Response>((resolve) => {
        finish = resolve;
      });
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => undefined);
      setup((url) => (url.includes('.md') ? pending : json(200, report())));

      const button = await screen.findByRole('button', { name: /Baixar em Markdown/ });
      await userEvent.click(button);
      await waitFor(() => expect(button).toBeDisabled());

      finish(new Response('# Relatório', { status: 200 }));
      await waitFor(() => expect(button).toBeEnabled());
      click.mockRestore();
    });

    it('se o download falhar, avisa e o botão destrava', async () => {
      setup((url) =>
        url.includes('.md') ? json(500, { message: 'Erro no servidor' }) : json(200, report()),
      );

      const button = await screen.findByRole('button', { name: /Baixar em Markdown/ });
      await userEvent.click(button);

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Erro no servidor'));
      expect(button).toBeEnabled();
    });
  });
});
