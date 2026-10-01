import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Area } from '@lifexp/shared';
import { setAccessToken } from '@/lib/apiClient';
import { AreasPage } from './AreasPage';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast, Toaster: () => null }));

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const makeArea = (n: number, overrides: Partial<Area> = {}): Area => ({
  id: `0192f1a0-7b3c-7000-8000-00000000000${n}`,
  name: `Área ${n}`,
  color: 'violet',
  icon: 'briefcase',
  position: n,
  archivedAt: null,
  ...overrides,
});

/** API falsa em memória que imita as regras do servidor (409 em nome repetido, arquivar etc.). */
function fakeApi(initial: Area[]) {
  const areas = [...initial];
  const calls: { method: string; url: string; body?: unknown }[] = [];

  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });

    if (method === 'GET' && url.startsWith('/api/areas')) {
      const includeArchived = url.includes('includeArchived=true');
      return json(
        200,
        areas.filter((a) => includeArchived || a.archivedAt === null),
      );
    }
    if (method === 'POST' && url === '/api/areas') {
      if (areas.some((a) => !a.archivedAt && a.name.toLowerCase() === body.name.toLowerCase())) {
        return json(409, { message: 'Já existe uma área ativa com esse nome' });
      }
      const created = makeArea(areas.length + 1, {
        ...body,
        id: `0192f1a0-7b3c-7000-8000-0000000000${areas.length + 10}`,
      });
      areas.push(created);
      return json(201, created);
    }
    const match = url.match(/^\/api\/areas\/([^/]+)(?:\/(archive|unarchive))?$/);
    const target = areas.find((a) => a.id === match?.[1]);
    if (match && target) {
      if (method === 'PATCH') Object.assign(target, body);
      if (match[2] === 'archive') target.archivedAt = '2026-10-01T12:00:00.000Z';
      if (match[2] === 'unarchive') target.archivedAt = null;
      return json(200, target);
    }
    return json(404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AreasPage />
    </QueryClientProvider>,
  );
}

describe('AreasPage', () => {
  beforeEach(() => {
    setAccessToken('token');
    toast.success.mockClear();
    toast.error.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lista as áreas ativas e não mostra as arquivadas por padrão', async () => {
    fakeApi([makeArea(1), makeArea(2, { archivedAt: '2026-09-01T00:00:00.000Z' })]);
    renderPage();

    expect(await screen.findByRole('article', { name: 'Área 1' })).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Área 2' })).not.toBeInTheDocument();
  });

  it('mostra as arquivadas ao ligar o filtro, com opção de restaurar', async () => {
    const api = fakeApi([makeArea(1), makeArea(2, { archivedAt: '2026-09-01T00:00:00.000Z' })]);
    renderPage();
    await screen.findByRole('article', { name: 'Área 1' });

    await userEvent.click(screen.getByRole('switch', { name: 'Mostrar arquivadas' }));

    const archived = await screen.findByRole('article', { name: 'Área 2' });
    expect(within(archived).getByText('Arquivada')).toBeInTheDocument();
    expect(api.calls.some((c) => c.url.endsWith('includeArchived=true'))).toBe(true);

    await userEvent.click(within(archived).getByRole('button', { name: 'Restaurar Área 2' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Área “Área 2” restaurada'));
  });

  it('cria uma área nova e ela aparece na lista', async () => {
    const api = fakeApi([makeArea(1)]);
    renderPage();
    await screen.findByRole('article', { name: 'Área 1' });

    await userEvent.click(screen.getByRole('button', { name: 'Nova área' }));
    await userEvent.type(await screen.findByLabelText('Nome'), 'Música');
    await userEvent.click(screen.getByRole('radio', { name: 'Rosa' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Música' }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar área' }));

    expect(await screen.findByRole('article', { name: 'Música' })).toBeInTheDocument();
    const post = api.calls.find((c) => c.method === 'POST' && c.url === '/api/areas');
    expect(post?.body).toEqual({ name: 'Música', color: 'pink', icon: 'music' });
    expect(toast.success).toHaveBeenCalledWith('Área “Música” criada');
  });

  it('valida o nome vazio no cliente, sem chamar a API', async () => {
    const api = fakeApi([makeArea(1)]);
    renderPage();
    await screen.findByRole('article', { name: 'Área 1' });

    await userEvent.click(screen.getByRole('button', { name: 'Nova área' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Criar área' }));

    expect(await screen.findByText('Informe o nome da área')).toBeInTheDocument();
    expect(api.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('mostra o erro do servidor quando o nome já existe (409) e mantém o diálogo aberto', async () => {
    fakeApi([makeArea(1, { name: 'Trabalho' })]);
    renderPage();
    await screen.findByRole('article', { name: 'Trabalho' });

    await userEvent.click(screen.getByRole('button', { name: 'Nova área' }));
    await userEvent.type(await screen.findByLabelText('Nome'), 'trabalho');
    await userEvent.click(screen.getByRole('button', { name: 'Criar área' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Já existe uma área ativa com esse nome',
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('edita a área enviando os campos do formulário', async () => {
    const api = fakeApi([makeArea(1, { name: 'Trabalho' })]);
    renderPage();
    await screen.findByRole('article', { name: 'Trabalho' });

    await userEvent.click(screen.getByRole('button', { name: 'Editar Trabalho' }));
    const name = await screen.findByLabelText('Nome');
    expect(name).toHaveValue('Trabalho');
    await userEvent.clear(name);
    await userEvent.type(name, 'Carreira');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('article', { name: 'Carreira' })).toBeInTheDocument();
    const patch = api.calls.find((c) => c.method === 'PATCH');
    expect(patch?.url).toBe('/api/areas/0192f1a0-7b3c-7000-8000-000000000001');
    expect(patch?.body).toMatchObject({ name: 'Carreira' });
  });

  it('arquiva a área e oferece desfazer pelo aviso', async () => {
    const api = fakeApi([makeArea(1), makeArea(2)]);
    renderPage();
    const card = await screen.findByRole('article', { name: 'Área 1' });

    await userEvent.click(within(card).getByRole('button', { name: 'Arquivar Área 1' }));

    await waitFor(() =>
      expect(screen.queryByRole('article', { name: 'Área 1' })).not.toBeInTheDocument(),
    );
    const [message, options] = toast.success.mock.calls.at(-1)!;
    expect(message).toBe('Área “Área 1” arquivada');

    options.action.onClick();
    expect(await screen.findByRole('article', { name: 'Área 1' })).toBeInTheDocument();
    expect(api.calls.map((c) => c.url)).toEqual(
      expect.arrayContaining([
        '/api/areas/0192f1a0-7b3c-7000-8000-000000000001/archive',
        '/api/areas/0192f1a0-7b3c-7000-8000-000000000001/unarchive',
      ]),
    );
  });

  it('mostra um convite quando não há áreas ativas', async () => {
    fakeApi([]);
    renderPage();
    expect(await screen.findByText('Nenhuma área ativa')).toBeInTheDocument();
  });

  it('mostra erro com opção de tentar de novo quando a API falha', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => json(500, { message: 'falhou' })),
    );
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar as áreas',
    );
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});
