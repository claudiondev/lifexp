import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppNotification } from '@lifexp/shared';
import { setAccessToken } from '@/lib/apiClient';
import { NotificationBell } from './NotificationBell';

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const makeNotification = (
  n: number,
  overrides: Partial<AppNotification> = {},
): AppNotification => ({
  id: `0192f1a0-7b3c-7000-8000-00000000f0${String(n).padStart(2, '0')}`,
  kind: 'digest',
  title: `Aviso ${n}`,
  body: `Corpo ${n}`,
  scheduledFor: '2026-10-07T11:00:00.000Z',
  createdAt: '2026-10-07T11:00:00.000Z',
  readAt: null,
  blockId: null,
  occurrenceDate: null,
  eventId: null,
  ...overrides,
});

interface Options {
  unread?: number;
  /** Páginas, na ordem em que a API devolve (a 1ª sem cursor). */
  pages?: AppNotification[][];
  listStatus?: number;
}

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function setup(options: Options = {}) {
  let unread = options.unread ?? 0;
  const pages = options.pages ?? [[]];
  const calls: { method: string; url: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ method, url });

      if (url === '/api/notifications/unread-count') return json(200, { count: unread });
      if (url.startsWith('/api/notifications?')) {
        if (options.listStatus) return json(options.listStatus, { message: 'falhou' });
        const before = new URL(url, 'http://x').searchParams.get('before');
        const index = before ? pages.findIndex((page) => page.at(-1)!.id === before) + 1 : 0;
        const items = pages[index] ?? [];
        return json(200, {
          items,
          nextCursor: index < pages.length - 1 ? items.at(-1)!.id : null,
        });
      }
      if (url === '/api/notifications/read-all' && method === 'POST') {
        const updated = unread;
        unread = 0;
        return json(200, { updated });
      }
      const read = url.match(/^\/api\/notifications\/([^/]+)\/read$/);
      if (read && method === 'POST') {
        unread = Math.max(0, unread - 1);
        return json(200, makeNotification(1, { id: read[1]!, readAt: '2026-10-07T12:00:00.000Z' }));
      }
      return json(404);
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/hoje']}>
        <Routes>
          <Route path="*" element={<NotificationBell />} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { calls };
}

const bell = (name: RegExp | string) => screen.findByRole('button', { name });

describe('NotificationBell', () => {
  beforeEach(() => {
    setAccessToken('token');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T12:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('sem não lidas: sino simples e sem selo', async () => {
    setup({ unread: 0 });
    const button = await bell('Notificações');
    await waitFor(() => expect(button).toHaveAccessibleName('Notificações'));
    expect(button).toHaveTextContent('');
  });

  it('com não lidas: selo com o número e o nome acessível com a contagem', async () => {
    setup({ unread: 3 });

    const button = await bell('Notificações, 3 não lidas');
    expect(button).toHaveTextContent('3');
  });

  it('passando de 99, o selo mostra 99+', async () => {
    setup({ unread: 250 });
    expect(await bell(/250 não lidas/)).toHaveTextContent('99+');
  });

  it('só busca a lista quando o painel abre', async () => {
    const { calls } = setup({ unread: 1, pages: [[makeNotification(1)]] });
    await bell(/1 não lidas/);
    expect(calls.some((c) => c.url.startsWith('/api/notifications?'))).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: /Notificações/ }));

    await screen.findByText('Aviso 1');
    expect(calls.some((c) => c.url.startsWith('/api/notifications?'))).toBe(true);
  });

  it('mostra título, corpo, quanto tempo faz e destaca as não lidas', async () => {
    setup({
      unread: 1,
      pages: [
        [
          makeNotification(2, { createdAt: '2026-10-07T11:55:00.000Z' }),
          makeNotification(1, {
            readAt: '2026-10-07T11:00:00.000Z',
            createdAt: '2026-10-07T09:00:00.000Z',
          }),
        ],
      ],
    });
    await userEvent.click(await bell(/Notificações/));

    const dialog = within(await screen.findByRole('dialog'));
    const unreadItem = await dialog.findByRole('button', { name: /Aviso 2/ });
    expect(unreadItem).toHaveTextContent('Não lida:');
    expect(unreadItem).toHaveTextContent('Corpo 2');
    expect(unreadItem).toHaveTextContent('há 5 min');
    const readItem = dialog.getByRole('button', { name: /Aviso 1/ });
    expect(readItem).not.toHaveTextContent('Não lida:');
    expect(readItem).toHaveTextContent('há 3 h');
  });

  it('sem avisos, explica quando eles aparecem', async () => {
    setup({ pages: [[]] });
    await userEvent.click(await bell(/Notificações/));

    expect(await screen.findByText(/Nada por aqui ainda/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Marcar todas/ })).not.toBeInTheDocument();
  });

  it('abrir um aviso não lido marca como lido, fecha o painel e leva ao destino', async () => {
    const { calls } = setup({
      unread: 1,
      pages: [
        [
          makeNotification(1, {
            kind: 'block',
            title: 'Corrida começa em 15 minutos',
            blockId: '0192f1a0-7b3c-7000-8000-0000000000b1',
            occurrenceDate: '2026-10-14',
          }),
        ],
      ],
    });
    await userEvent.click(await bell(/Notificações/));

    await userEvent.click(await screen.findByRole('button', { name: /Corrida começa/ }));

    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'POST',
        url: '/api/notifications/0192f1a0-7b3c-7000-8000-00000000f001/read',
      }),
    );
    expect(screen.getByTestId('where')).toHaveTextContent('/semana?inicio=2026-10-14');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Notificações' })).toBeInTheDocument(),
    );
  });

  it('abrir um aviso que já foi lido só navega, sem chamar a API de leitura', async () => {
    const { calls } = setup({
      pages: [
        [
          makeNotification(1, {
            readAt: '2026-10-07T11:30:00.000Z',
            kind: 'event',
            eventId: '0192f1a0-7b3c-7000-8000-0000000000e1',
          }),
        ],
      ],
    });
    await userEvent.click(await bell(/Notificações/));

    await userEvent.click(await screen.findByRole('button', { name: /Aviso 1/ }));

    expect(screen.getByTestId('where')).toHaveTextContent('/calendario');
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('"Marcar todas como lidas" só aparece com não lidas e zera o selo', async () => {
    const { calls } = setup({ unread: 2, pages: [[makeNotification(2), makeNotification(1)]] });
    await userEvent.click(await bell(/2 não lidas/));

    await userEvent.click(await screen.findByRole('button', { name: 'Marcar todas como lidas' }));

    await waitFor(() =>
      expect(calls).toContainEqual({ method: 'POST', url: '/api/notifications/read-all' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Marcar todas/ })).not.toBeInTheDocument(),
    );
    // o selo (atrás do painel aberto) volta ao nome sem contagem
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Notificações', hidden: true }),
      ).toBeInTheDocument(),
    );
  });

  it('pagina com "Carregar mais" usando o cursor e some quando acaba', async () => {
    const first = [makeNotification(3), makeNotification(2)];
    const second = [makeNotification(1)];
    const { calls } = setup({ pages: [first, second] });
    await userEvent.click(await bell(/Notificações/));
    await screen.findByText('Aviso 3');
    expect(screen.queryByText('Aviso 1')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));

    expect(await screen.findByText('Aviso 1')).toBeInTheDocument();
    expect(calls.map((c) => c.url)).toContain(`/api/notifications?limit=20&before=${first[1]!.id}`);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument(),
    );
  });

  it('erro ao carregar oferece tentar de novo', async () => {
    const { calls } = setup({ listStatus: 500 });
    await userEvent.click(await bell(/Notificações/));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar as notificações',
    );
    const before = calls.length;
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(calls.length).toBeGreaterThan(before));
  });

  it('o contador é consultado de novo a cada minuto', async () => {
    vi.useRealTimers();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { calls } = setup({ unread: 1 });
    await bell(/1 não lidas/);
    const counts = () => calls.filter((c) => c.url === '/api/notifications/unread-count').length;
    expect(counts()).toBe(1);

    await vi.advanceTimersByTimeAsync(60_000);

    await waitFor(() => expect(counts()).toBe(2));
  });
});
