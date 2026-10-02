import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Occurrence } from '@lifexp/shared';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { setAccessToken } from '@/lib/apiClient';
import { WeekPage } from './WeekPage';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast, Toaster: () => null }));

const AREA_ID = '0192f1a0-7b3c-7000-8000-0000000000b1';
const ACTIVITY_ID = '0192f1a0-7b3c-7000-8000-0000000000a1';
const BLOCK_ID = '0192f1a0-7b3c-7000-8000-0000000000c1';
const WEEK = '2026-10-05';
/** Largura de cada coluna de dia e altura da hora (HOUR_PX) usadas nas contas do teste. */
const COLUMN = 100;
const HOUR = 48;

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const occurrence = (overrides: Partial<Occurrence> = {}): Occurrence => ({
  blockId: BLOCK_ID,
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

interface Options {
  occurrences?: Occurrence[];
  completed?: boolean;
  /** Resposta do PUT da exceção; por padrão o servidor aceita e a semana passa a refletir. */
  putStatus?: number;
  /** Segura a resposta do PUT até o teste liberar (para ver o estado otimista). */
  hold?: Promise<void>;
}

function setup(options: Options = {}) {
  let occurrences = options.occurrences ?? [occurrence()];
  const puts: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
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
        const end = new Date(`${weekStart}T00:00:00Z`);
        end.setUTCDate(end.getUTCDate() + 6);
        const mine = weekStart === WEEK;
        return json(200, {
          weekStart,
          weekEnd: end.toISOString().slice(0, 10),
          occurrences: mine ? occurrences : [],
          completions:
            mine && options.completed
              ? [
                  {
                    id: '0192f1a0-7b3c-7000-8000-0000000000d1',
                    blockId: BLOCK_ID,
                    occurrenceDate: '2026-10-07',
                    completedAt: '2026-10-07T13:00:00.000Z',
                    activityId: ACTIVITY_ID,
                    areaId: AREA_ID,
                    durationMin: 60,
                    xpAmount: 60,
                  },
                ]
              : [],
        });
      }
      const exception = /^\/api\/blocks\/([^/]+)\/exceptions\/([^/]+)$/.exec(url);
      if (exception && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as Record<string, string | number>;
        puts.push({ url, body });
        await options.hold;
        if (options.putStatus) {
          return json(options.putStatus, { message: 'Ocorrência já concluída' });
        }
        // Imita o servidor: o PUT substitui a exceção, e a semana passa a mostrar o resultado.
        occurrences = occurrences.map((item) =>
          item.blockId === exception[1] && item.occurrenceDate === exception[2]
            ? {
                ...item,
                date: String(body.newDate ?? item.occurrenceDate),
                startTime: String(body.newStartTime),
                durationMin: Number(body.newDurationMin),
                modified: true,
              }
            : item,
        );
        return json(200, {
          blockId: exception[1],
          occurrenceDate: exception[2],
          type: 'override',
          newDate: body.newDate ?? null,
          newStartTime: body.newStartTime ?? null,
          newDurationMin: body.newDurationMin ?? null,
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
  return { puts };
}

const card = (name: RegExp) => screen.findByRole('button', { name });
const column = (name: RegExp) => screen.getByRole('region', { name });

/** Aperta o botão do mouse no cartão e move o ponteiro; quem chama decide se solta. */
function dragBy(element: HTMLElement, deltaX: number, deltaY: number, pointerType = 'mouse') {
  fireEvent.pointerDown(element, { clientX: 300, clientY: 200, button: 0, pointerType });
  fireEvent.pointerMove(window, { clientX: 300 + deltaX, clientY: 200 + deltaY });
}
/** Solta o ponteiro; o navegador dispara um clique em seguida, e o teste também. */
function release(element: HTMLElement) {
  fireEvent.pointerUp(window);
  fireEvent.click(element);
}

describe('WeekPage: arrastar e soltar na grade (RF18)', () => {
  beforeEach(() => {
    setAccessToken(null);
    toast.success.mockClear();
    toast.error.mockClear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T15:00:00.000Z'));
    // O jsdom não calcula layout: toda coluna de dia "mede" 100 px de largura.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: COLUMN,
      height: 0,
      top: 0,
      left: 0,
      right: COLUMN,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('soltar em outro dia e horário altera só esta ocorrência (exceção override) e avisa', async () => {
    const { puts } = setup();
    const block = await card(/Reunião, quarta-feira, 09:00 às 10:00/);

    // dois dias à direita (sexta) e uma hora e meia para baixo (10:30)
    dragBy(block, 2 * COLUMN, 1.5 * HOUR);
    release(block);

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      url: `/api/blocks/${BLOCK_ID}/exceptions/2026-10-07`,
      body: {
        type: 'override',
        newDate: '2026-10-09',
        newStartTime: '10:30',
        newDurationMin: 60,
      },
    });
    const friday = column(/sexta-feira, 9 de outubro/);
    expect(
      await within(friday).findByRole('button', { name: /Reunião, sexta-feira, 10:30 às 11:30/ }),
    ).toBeInTheDocument();
    expect(within(column(/quarta-feira/)).queryByRole('button')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Ocorrência movida', {
        description: 'Só esta vez; a série não mudou.',
      }),
    );
    // o clique que o navegador dispara ao soltar não abre o painel de ações
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('o horário encaixa de 15 em 15 minutos', async () => {
    const { puts } = setup();
    const block = await card(/Reunião, quarta-feira/);

    dragBy(block, 0, 20); // 25 min: encaixa em 09:30
    release(block);

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]!.body).toMatchObject({ newDate: '2026-10-07', newStartTime: '09:30' });
  });

  it('durante o arrasto o cartão já mostra o novo horário, e nada é enviado antes de soltar', async () => {
    const { puts } = setup();
    const block = await card(/Reunião, quarta-feira/);

    dragBy(block, COLUMN, HOUR);

    expect(block).toHaveAttribute('data-dragging', 'true');
    expect(block).toHaveTextContent('10:00 às 11:00');
    expect(block.style.transform).toBe(`translate(${COLUMN}px, ${HOUR}px)`);
    expect(puts).toHaveLength(0);

    release(block);
    await waitFor(() => expect(puts).toHaveLength(1));
  });

  it('a grade muda na hora (otimista), antes de o servidor responder', async () => {
    let free = () => {};
    const hold = new Promise<void>((resolve) => (free = resolve));
    const { puts } = setup({ hold });
    const block = await card(/Reunião, quarta-feira/);

    dragBy(block, -COLUMN, 0);
    release(block);

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(
      await within(column(/terça-feira/)).findByRole('button', { name: /Reunião, terça-feira/ }),
    ).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
    await act(async () => free());
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it('se o servidor recusa, o bloco volta ao lugar e aparece o motivo', async () => {
    const { puts } = setup({ putStatus: 409 });
    const block = await card(/Reunião, quarta-feira/);

    dragBy(block, COLUMN, HOUR);
    release(block);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Não foi possível mover o bloco', {
        description: 'Ocorrência já concluída',
      }),
    );
    expect(puts).toHaveLength(1);
    expect(await card(/Reunião, quarta-feira, 09:00 às 10:00/)).toBeInTheDocument();
    expect(within(column(/quinta-feira/)).queryByRole('button')).not.toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('movimento curto é clique: abre o painel e não move nada', async () => {
    const { puts } = setup();
    const block = await card(/Reunião, quarta-feira/);

    dragBy(block, 3, 2);
    release(block);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(puts).toHaveLength(0);
  });

  it('arrastar e voltar ao mesmo lugar não envia nada', async () => {
    const { puts } = setup();
    const block = await card(/Reunião, quarta-feira/);

    dragBy(block, 30, 5); // passa do limiar, mas encaixa de volta em quarta 09:00
    release(block);

    await act(async () => {});
    expect(puts).toHaveLength(0);
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Esc cancela o arrasto', async () => {
    const { puts } = setup();
    const block = await card(/Reunião, quarta-feira/);

    dragBy(block, COLUMN, HOUR);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(block).not.toHaveAttribute('data-dragging');
    expect(block.style.transform).toBe('');
    release(block);

    await act(async () => {});
    expect(puts).toHaveLength(0);
    expect(block).toHaveTextContent('09:00 às 10:00');
  });

  it('depois de um arrasto, um clique de verdade volta a abrir o painel', async () => {
    const { puts } = setup();
    const block = await card(/Reunião, quarta-feira/);
    dragBy(block, 0, HOUR);
    release(block);
    await waitFor(() => expect(puts).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 5));

    fireEvent.click(await card(/Reunião, quarta-feira, 10:00 às 11:00/));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('não sai da semana nem das horas visíveis', async () => {
    const { puts } = setup();
    const block = await card(/Reunião, quarta-feira/);

    dragBy(block, 50 * COLUMN, 50 * HOUR);
    release(block);

    await waitFor(() => expect(puts).toHaveLength(1));
    // domingo é o último dia; 21:00 é o último início que cabe na grade 06h–22h
    expect(puts[0]!.body).toMatchObject({ newDate: '2026-10-11', newStartTime: '21:00' });
  });

  it('preserva a duração de uma ocorrência que já tinha sido alterada', async () => {
    const { puts } = setup({ occurrences: [occurrence({ durationMin: 90, modified: true })] });
    const block = await card(/Reunião, quarta-feira, 09:00 às 10:30/);

    dragBy(block, 0, HOUR);
    release(block);

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]!.body).toMatchObject({ newStartTime: '10:00', newDurationMin: 90 });
  });

  it('uma ocorrência movida continua presa à data ORIGINAL dela na série', async () => {
    const { puts } = setup({
      occurrences: [occurrence({ date: '2026-10-08', startTime: '14:00', modified: true })],
    });
    const block = await card(/Reunião, quinta-feira, 14:00 às 15:00/);

    dragBy(block, COLUMN, 0);
    release(block);

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]!.url).toBe(`/api/blocks/${BLOCK_ID}/exceptions/2026-10-07`);
    expect(puts[0]!.body).toMatchObject({ newDate: '2026-10-09', newStartTime: '14:00' });
  });

  it.each([
    ['concluída', { completed: true }, /Reunião, quarta-feira.*concluído/],
    ['pulada', { occurrences: [occurrence({ skipped: true })] }, /Reunião, quarta-feira.*pulado/],
  ] as const)(
    'ocorrência %s não se arrasta: continua sendo só um clique',
    async (_n, opts, name) => {
      const { puts } = setup(opts as Options);
      const block = await card(name);

      dragBy(block, COLUMN, HOUR);
      expect(block).not.toHaveAttribute('data-dragging');
      release(block);

      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(puts).toHaveLength(0);
    },
  );

  it('toque não arrasta (fica livre para rolar a grade) e botão direito também não', async () => {
    const { puts } = setup();
    const block = await card(/Reunião, quarta-feira/);

    dragBy(block, COLUMN, HOUR, 'touch');
    expect(block).not.toHaveAttribute('data-dragging');
    fireEvent.pointerUp(window);

    fireEvent.pointerDown(block, { clientX: 300, clientY: 200, button: 2, pointerType: 'mouse' });
    fireEvent.pointerMove(window, { clientX: 400, clientY: 300 });
    expect(block).not.toHaveAttribute('data-dragging');
    fireEvent.pointerUp(window);

    await act(async () => {});
    expect(puts).toHaveLength(0);
  });
});
