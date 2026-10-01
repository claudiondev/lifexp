import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Occurrence } from '@lifexp/shared';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { setAccessToken } from '@/lib/apiClient';
import { WeekPage } from '@/pages/WeekPage';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast, Toaster: () => null }));

const AREA_ID = '0192f1a0-7b3c-7000-8000-0000000000b1';
const ACTIVITY_ID = '0192f1a0-7b3c-7000-8000-0000000000a1';
const OTHER_ACTIVITY_ID = '0192f1a0-7b3c-7000-8000-0000000000a2';
const WEEKLY_ID = '0192f1a0-7b3c-7000-8000-0000000000c1';
const ONCE_ID = '0192f1a0-7b3c-7000-8000-0000000000c2';

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const weeklyOccurrence = (overrides: Partial<Occurrence> = {}): Occurrence => ({
  blockId: WEEKLY_ID,
  occurrenceDate: '2026-10-07',
  date: '2026-10-07',
  startTime: '09:00',
  durationMin: 60,
  activityId: ACTIVITY_ID,
  areaId: AREA_ID,
  recurrence: 'weekly',
  skipped: false,
  modified: false,
  ...overrides,
});

const onceOccurrence = (overrides: Partial<Occurrence> = {}): Occurrence => ({
  ...weeklyOccurrence(),
  blockId: ONCE_ID,
  occurrenceDate: '2026-10-08',
  date: '2026-10-08',
  startTime: '14:00',
  recurrence: 'once',
  ...overrides,
});

interface Call {
  method: string;
  url: string;
  body?: Record<string, unknown>;
}

function setup(initial: Occurrence[], options: { failWith?: number } = {}) {
  let occurrences = initial.map((o) => ({ ...o }));
  const originals = new Map(initial.map((o) => [`${o.blockId}|${o.occurrenceDate}`, { ...o }]));
  const calls: Call[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;

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
          weekEnd: '2026-10-11',
          occurrences: weekStart === '2026-10-05' ? occurrences : [],
        });
      }

      // --- escritas: registra e reflete o efeito na grade ---
      calls.push({ method, url, body });
      if (options.failWith)
        return json(options.failWith, { message: 'Algo deu errado no servidor' });

      const exception = url.match(/^\/api\/blocks\/([^/]+)\/exceptions\/(\d{4}-\d{2}-\d{2})$/);
      if (exception) {
        const [, blockId, date] = exception;
        occurrences = occurrences.map((o) => {
          if (o.blockId !== blockId || o.occurrenceDate !== date) return o;
          if (method === 'DELETE')
            return { ...(originals.get(`${blockId}|${date}`) as Occurrence) };
          if (body?.type === 'skip') return { ...o, skipped: true, modified: false };
          return {
            ...o,
            skipped: false,
            modified: true,
            date: (body?.newDate as string) ?? o.date,
            startTime: (body?.newStartTime as string) ?? o.startTime,
            durationMin: (body?.newDurationMin as number) ?? o.durationMin,
          };
        });
        return method === 'DELETE'
          ? new Response(null, { status: 204 })
          : json(200, {
              blockId,
              occurrenceDate: date,
              type: body?.type,
              newDate: null,
              newStartTime: null,
              newDurationMin: null,
            });
      }

      const block = url.match(/^\/api\/blocks\/([^/?]+)(?:\?from=(\d{4}-\d{2}-\d{2}))?$/);
      if (block && method === 'DELETE') {
        const [, blockId, from] = block;
        occurrences = occurrences.filter(
          (o) => !(o.blockId === blockId && o.occurrenceDate >= (from as string)),
        );
        return new Response(null, { status: 204 });
      }
      if (block && method === 'PATCH') {
        const [, blockId] = block;
        occurrences = occurrences.map((o) =>
          o.blockId === blockId
            ? {
                ...o,
                startTime: (body?.startTime as string) ?? o.startTime,
                durationMin: (body?.durationMin as number) ?? o.durationMin,
                date: (body?.date as string) ?? o.date,
                occurrenceDate: (body?.date as string) ?? o.occurrenceDate,
              }
            : o,
        );
        return json(200, {
          id: blockId,
          activityId: ACTIVITY_ID,
          recurrence: 'weekly',
          weekday: 3,
          date: null,
          startTime: '09:00',
          durationMin: 60,
          validFrom: '2026-10-07',
          validUntil: null,
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
  return { calls };
}

const card = (name: RegExp | string) => screen.findByRole('button', { name });
const dialog = () => screen.findByRole('dialog');
const writes = (calls: Call[]) => calls.map((call) => `${call.method} ${call.url}`);

describe('ações por ocorrência', () => {
  beforeEach(() => {
    setAccessToken(null);
    toast.success.mockClear();
    toast.error.mockClear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T15:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('painel de detalhes', () => {
    it('abre ao clicar no bloco e mostra atividade, área, dia, horário e repetição', async () => {
      setup([weeklyOccurrence()]);
      await userEvent.click(await card(/Reunião, quarta-feira/));

      const panel = within(await dialog());
      expect(panel.getByRole('heading', { name: 'Reunião' })).toBeInTheDocument();
      expect(panel.getByText('Trabalho')).toBeInTheDocument();
      expect(panel.getByText('Quarta-feira, 7 de outubro de 2026')).toBeInTheDocument();
      expect(panel.getByText(/09:00 às 10:00 · 1 h/)).toBeInTheDocument();
      expect(panel.getByText('Toda quarta-feira')).toBeInTheDocument();
    });

    it('o bloco é um botão acessível por teclado (Enter abre)', async () => {
      setup([weeklyOccurrence()]);
      const button = await card(/Reunião/);

      button.focus();
      await userEvent.keyboard('{Enter}');

      expect(await dialog()).toBeInTheDocument();
    });

    it('Esc fecha sem chamar a API', async () => {
      const { calls } = setup([weeklyOccurrence()]);
      await userEvent.click(await card(/Reunião/));
      await dialog();

      await userEvent.keyboard('{Escape}');

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(calls).toHaveLength(0);
    });

    it('bloco avulso é descrito como avulso', async () => {
      setup([onceOccurrence()]);
      await userEvent.click(await card(/Reunião, quinta-feira/));
      expect(within(await dialog()).getByText(/Bloco avulso/)).toBeInTheDocument();
    });
  });

  describe('pular (RF17)', () => {
    it('pula só aquela ocorrência e a grade a mostra como pulada', async () => {
      const { calls } = setup([weeklyOccurrence()]);
      await userEvent.click(await card(/Reunião/));

      await userEvent.click(within(await dialog()).getByRole('button', { name: /Pular só esta/ }));

      await waitFor(() => expect(calls).toHaveLength(1));
      expect(calls[0]).toEqual({
        method: 'PUT',
        url: `/api/blocks/${WEEKLY_ID}/exceptions/2026-10-07`,
        body: { type: 'skip' },
      });
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(await card(/pulado/)).toBeInTheDocument();
    });

    it('o aviso oferece desfazer, que restaura a ocorrência', async () => {
      const { calls } = setup([weeklyOccurrence()]);
      await userEvent.click(await card(/Reunião/));
      await userEvent.click(within(await dialog()).getByRole('button', { name: /Pular só esta/ }));
      await waitFor(() => expect(toast.success).toHaveBeenCalled());

      const [message, options] = toast.success.mock.calls.at(-1)!;
      expect(message).toBe('“Reunião” pulado nesta data');
      expect(options.description).toMatch(/Sem XP e sem penalidade/);
      options.action.onClick();

      await waitFor(() =>
        expect(writes(calls)).toEqual([
          `PUT /api/blocks/${WEEKLY_ID}/exceptions/2026-10-07`,
          `DELETE /api/blocks/${WEEKLY_ID}/exceptions/2026-10-07`,
        ]),
      );
      expect(await card(/Reunião, quarta-feira, 09:00 às 10:00$/)).toBeInTheDocument();
    });

    it('ocorrência pulada oferece restaurar, e não pular de novo', async () => {
      const { calls } = setup([weeklyOccurrence({ skipped: true })]);
      await userEvent.click(await card(/pulado/));
      const panel = within(await dialog());

      expect(panel.queryByRole('button', { name: /Pular só esta/ })).not.toBeInTheDocument();
      await userEvent.click(panel.getByRole('button', { name: /Restaurar esta ocorrência/ }));

      await waitFor(() => expect(calls).toHaveLength(1));
      expect(calls[0]).toMatchObject({
        method: 'DELETE',
        url: `/api/blocks/${WEEKLY_ID}/exceptions/2026-10-07`,
      });
      expect(toast.success).toHaveBeenCalledWith('Ocorrência restaurada');
    });
  });

  describe('alterar só esta (RF49)', () => {
    const open = async () => {
      await userEvent.click(await card(/Reunião/));
      await userEvent.click(
        within(await dialog()).getByRole('button', { name: /Alterar só esta/ }),
      );
    };

    it('oferece só os 7 dias da semana da ocorrência', async () => {
      setup([weeklyOccurrence()]);
      await open();

      const options = within(screen.getByLabelText('Dia')).getAllByRole('option');
      expect(options.map((option) => option.textContent)).toEqual([
        'Segunda-feira, 5',
        'Terça-feira, 6',
        'Quarta-feira, 7',
        'Quinta-feira, 8',
        'Sexta-feira, 9',
        'Sábado, 10',
        'Domingo, 11',
      ]);
    });

    it('envia dia, horário e duração, e o bloco muda de coluna na grade', async () => {
      const { calls } = setup([weeklyOccurrence()]);
      await open();

      await userEvent.selectOptions(screen.getByLabelText('Dia'), 'Sexta-feira, 9');
      fireEvent.change(screen.getByLabelText('Início'), { target: { value: '14:30' } });
      await userEvent.selectOptions(screen.getByLabelText('Duração'), '30 min');
      await userEvent.click(screen.getByRole('button', { name: 'Salvar só esta' }));

      await waitFor(() => expect(calls).toHaveLength(1));
      expect(calls[0]).toEqual({
        method: 'PUT',
        url: `/api/blocks/${WEEKLY_ID}/exceptions/2026-10-07`,
        body: {
          type: 'override',
          newDate: '2026-10-09',
          newStartTime: '14:30',
          newDurationMin: 30,
        },
      });
      const friday = await screen.findByRole('region', { name: /sexta-feira/ });
      expect(
        await within(friday).findByRole('button', { name: /14:30 às 15:00/ }),
      ).toBeInTheDocument();
      expect(
        within(screen.getByRole('region', { name: /quarta-feira/ })).queryByRole('button'),
      ).not.toBeInTheDocument();
    });

    it('só habilita salvar depois de alguma mudança', async () => {
      setup([weeklyOccurrence()]);
      await open();
      const save = screen.getByRole('button', { name: 'Salvar só esta' });
      expect(save).toBeDisabled();

      fireEvent.change(screen.getByLabelText('Início'), { target: { value: '10:00' } });
      expect(save).toBeEnabled();
      fireEvent.change(screen.getByLabelText('Início'), { target: { value: '09:00' } });
      expect(save).toBeDisabled();
    });

    it('bloqueia o resultado que atravessaria a meia-noite', async () => {
      const { calls } = setup([weeklyOccurrence()]);
      await open();

      fireEvent.change(screen.getByLabelText('Início'), { target: { value: '23:30' } });

      expect(screen.getByText('O bloco não pode atravessar a meia-noite.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Salvar só esta' })).toBeDisabled();
      expect(calls).toHaveLength(0);
    });

    it('ocorrência alterada oferece desfazer a alteração e mostra o dia original', async () => {
      const { calls } = setup([
        weeklyOccurrence({ modified: true, date: '2026-10-09', startTime: '14:30' }),
      ]);
      await userEvent.click(await card(/Reunião, sexta-feira/));
      const panel = within(await dialog());

      expect(panel.getByText(/O dia original era 7 de outubro de 2026/)).toBeInTheDocument();
      await userEvent.click(panel.getByRole('button', { name: /Desfazer a alteração/ }));

      await waitFor(() => expect(calls).toHaveLength(1));
      expect(calls[0]).toMatchObject({
        method: 'DELETE',
        url: `/api/blocks/${WEEKLY_ID}/exceptions/2026-10-07`,
      });
      expect(toast.success).toHaveBeenCalledWith('Alteração desfeita');
    });

    it('Voltar retorna aos detalhes sem chamar a API', async () => {
      const { calls } = setup([weeklyOccurrence()]);
      await open();

      await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));

      expect(
        within(await dialog()).getByRole('button', { name: /Pular só esta/ }),
      ).toBeInTheDocument();
      expect(calls).toHaveLength(0);
    });
  });

  describe('editar esta e as próximas', () => {
    const open = async (name: RegExp = /Reunião/) => {
      await userEvent.click(await card(name));
      await userEvent.click(
        within(await dialog()).getByRole('button', { name: /Editar esta e as próximas/ }),
      );
    };

    it('explica que o passado não muda e só habilita salvar com mudança', async () => {
      setup([weeklyOccurrence()]);
      await open();

      expect(
        screen.getByText(/a partir de 7 de outubro de 2026.*O que já passou não muda/),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Salvar esta e as próximas' })).toBeDisabled();
    });

    it('envia só o que mudou, com `from` = data da ocorrência', async () => {
      const { calls } = setup([weeklyOccurrence()]);
      await open();

      fireEvent.change(screen.getByLabelText('Início'), { target: { value: '18:00' } });
      await userEvent.click(screen.getByRole('button', { name: 'Salvar esta e as próximas' }));

      await waitFor(() => expect(calls).toHaveLength(1));
      expect(calls[0]).toEqual({
        method: 'PATCH',
        url: `/api/blocks/${WEEKLY_ID}`,
        body: { from: '2026-10-07', startTime: '18:00' },
      });
      expect(toast.success).toHaveBeenCalledWith(
        'Série atualizada',
        expect.objectContaining({
          description: expect.stringContaining('O que já passou ficou como estava') as string,
        }),
      );
    });

    it('numa ocorrência movida, `from` é a data ORIGINAL da série, não o dia para onde foi', async () => {
      const { calls } = setup([
        weeklyOccurrence({ modified: true, date: '2026-10-09', startTime: '14:30' }), // quarta 7 -> sexta 9
      ]);
      await userEvent.click(await card(/Reunião, sexta-feira/));
      await userEvent.click(
        within(await dialog()).getByRole('button', { name: /Editar esta e as próximas/ }),
      );

      expect(screen.getByText(/a partir de 7 de outubro de 2026/)).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Início'), { target: { value: '18:00' } });
      await userEvent.click(screen.getByRole('button', { name: 'Salvar esta e as próximas' }));

      await waitFor(() => expect(calls).toHaveLength(1));
      expect(calls[0]?.body).toEqual({ from: '2026-10-07', startTime: '18:00' });
    });

    it('muda o dia da semana e a atividade', async () => {
      const { calls } = setup([weeklyOccurrence()]);
      await open();

      await userEvent.selectOptions(screen.getByLabelText('Dia da semana'), 'Sexta-feira');
      await userEvent.selectOptions(screen.getByLabelText('Atividade'), 'Leitura');
      await userEvent.click(screen.getByRole('button', { name: 'Salvar esta e as próximas' }));

      await waitFor(() => expect(calls).toHaveLength(1));
      expect(calls[0]?.body).toEqual({
        from: '2026-10-07',
        weekday: 5,
        activityId: OTHER_ACTIVITY_ID,
      });
    });

    it('bloqueia o resultado que atravessaria a meia-noite', async () => {
      setup([weeklyOccurrence()]);
      await open();
      fireEvent.change(screen.getByLabelText('Início'), { target: { value: '23:30' } });
      expect(screen.getByText('O bloco não pode atravessar a meia-noite.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Salvar esta e as próximas' })).toBeDisabled();
    });

    it('mostra o erro do servidor e mantém o painel aberto', async () => {
      setup([weeklyOccurrence()], { failWith: 409 });
      await open();
      fireEvent.change(screen.getByLabelText('Início'), { target: { value: '18:00' } });
      await userEvent.click(screen.getByRole('button', { name: 'Salvar esta e as próximas' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Algo deu errado no servidor');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('bloco avulso usa "Editar bloco" com data, e não fala em "próximas"', async () => {
      const { calls } = setup([onceOccurrence()]);
      await userEvent.click(await card(/Reunião, quinta-feira/));
      const panel = within(await dialog());
      expect(panel.queryByRole('button', { name: /esta e as próximas/ })).not.toBeInTheDocument();
      await userEvent.click(panel.getByRole('button', { name: /Editar bloco/ }));

      expect(screen.queryByLabelText('Dia da semana')).not.toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-10-09' } });
      await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

      await waitFor(() => expect(calls).toHaveLength(1));
      expect(calls[0]).toEqual({
        method: 'PATCH',
        url: `/api/blocks/${ONCE_ID}`,
        body: { from: '2026-10-08', date: '2026-10-09' },
      });
    });
  });

  describe('excluir', () => {
    it('série semanal pede confirmação e explica que o passado fica', async () => {
      const { calls } = setup([weeklyOccurrence()]);
      await userEvent.click(await card(/Reunião/));
      await userEvent.click(
        within(await dialog()).getByRole('button', { name: /Excluir esta e as próximas/ }),
      );

      expect(screen.getByText(/A série termina antes de 7 de outubro de 2026/)).toBeInTheDocument();
      expect(screen.getByText(/continuam no seu histórico/)).toBeInTheDocument();
      expect(calls).toHaveLength(0); // ainda não excluiu: falta confirmar
    });

    it('cancelar não exclui nada', async () => {
      const { calls } = setup([weeklyOccurrence()]);
      await userEvent.click(await card(/Reunião/));
      await userEvent.click(
        within(await dialog()).getByRole('button', { name: /Excluir esta e as próximas/ }),
      );

      await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(calls).toHaveLength(0);
      expect(
        within(await dialog()).getByRole('button', { name: /Pular só esta/ }),
      ).toBeInTheDocument();
    });

    it('confirmar encerra a série a partir da data e a grade atualiza', async () => {
      const { calls } = setup([weeklyOccurrence()]);
      await userEvent.click(await card(/Reunião/));
      await userEvent.click(
        within(await dialog()).getByRole('button', { name: /Excluir esta e as próximas/ }),
      );

      await userEvent.click(
        within(screen.getByRole('region', { name: 'Excluir esta e as próximas' })).getByRole(
          'button',
          {
            name: 'Excluir esta e as próximas',
          },
        ),
      );

      await waitFor(() => expect(calls).toHaveLength(1));
      expect(calls[0]).toMatchObject({
        method: 'DELETE',
        url: `/api/blocks/${WEEKLY_ID}?from=2026-10-07`,
      });
      expect(toast.success).toHaveBeenCalledWith('Série encerrada');
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: /Reunião/ })).not.toBeInTheDocument(),
      );
    });

    it('bloco avulso: confirma e remove o bloco', async () => {
      const { calls } = setup([onceOccurrence()]);
      await userEvent.click(await card(/Reunião, quinta-feira/));
      await userEvent.click(within(await dialog()).getByRole('button', { name: /Excluir bloco/ }));
      expect(screen.getByText(/O bloco será removido/)).toBeInTheDocument();

      await userEvent.click(
        within(screen.getByRole('region', { name: 'Excluir bloco' })).getByRole('button', {
          name: 'Excluir bloco',
        }),
      );

      await waitFor(() => expect(calls).toHaveLength(1));
      expect(calls[0]).toMatchObject({
        method: 'DELETE',
        url: `/api/blocks/${ONCE_ID}?from=2026-10-08`,
      });
      expect(toast.success).toHaveBeenCalledWith('Bloco excluído');
    });
  });

  describe('erros e troca de ocorrência', () => {
    it('erro do servidor ao pular aparece no painel, que continua aberto', async () => {
      setup([weeklyOccurrence()], { failWith: 500 });
      await userEvent.click(await card(/Reunião/));

      await userEvent.click(within(await dialog()).getByRole('button', { name: /Pular só esta/ }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Algo deu errado no servidor');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(toast.success).not.toHaveBeenCalled();
    });

    it('abrir outra ocorrência volta para os detalhes (não herda o modo anterior)', async () => {
      setup([weeklyOccurrence(), onceOccurrence()]);
      await userEvent.click(await card(/Reunião, quarta-feira/));
      await userEvent.click(
        within(await dialog()).getByRole('button', { name: /Alterar só esta/ }),
      );
      expect(screen.getByLabelText('Dia')).toBeInTheDocument();

      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await userEvent.click(await card(/Reunião, quinta-feira/));

      expect(
        within(await dialog()).getByRole('button', { name: /Pular só esta/ }),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText('Dia')).not.toBeInTheDocument();
    });
  });
});
