import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@lifexp/shared';
import { AuthContext, type AuthContextValue } from '@/features/auth/AuthContext';
import { json } from '@/features/goals/testing';
import { makeFakeNotes, makeNote, type FakeNotes } from '@/features/notes/testing';
import { setAccessToken } from '@/lib/apiClient';
import { NotesPage } from './NotesPage';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast, Toaster: () => null }));

const USER = {
  id: '0192f1a0-7b3c-7000-8000-000000000009',
  name: 'Ana',
  email: 'ana@test.dev',
  timezone: 'America/Sao_Paulo',
  avatarKey: 'swords',
  createdAt: '2026-01-01T00:00:00.000Z',
} as User;

const nid = (n: number) => `0192f1a0-7b3c-7000-8000-0000000000${String(n).padStart(2, '0')}`;

function setup(fake: FakeNotes, entry = '/notas', listStatus?: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (listStatus && url.startsWith('/api/notes?'))
        return json(listStatus, { message: 'falhou' });
      return fake.handle(url, init) ?? json(404);
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
          <NotesPage />
          <Where />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
  return { where: () => where };
}

const listCalls = (fake: FakeNotes) =>
  fake.calls
    .filter((call) => call.method === 'GET' && call.url.startsWith('/api/notes?'))
    .map((c) => c.url);
const titles = () =>
  within(screen.getByRole('region', { name: 'Lista de notas' }))
    .queryAllByRole('listitem')
    .map((li) => li.querySelector('p')?.textContent);

describe('NotesPage', () => {
  beforeEach(() => {
    setAccessToken('token');
    toast.error.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sem notas, convida a escrever a primeira, e o botão leva ao editor', async () => {
    setup(makeFakeNotes());
    expect(await screen.findByText(/Você ainda não tem notas/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nova nota' })).toHaveAttribute('href', '/notas/nova');
  });

  it('mostra título, trecho, tags, vínculo e a data, com link para a nota', async () => {
    const fake = makeFakeNotes([
      makeNote({
        id: nid(1),
        title: 'Ideias do livro',
        content: '# Capítulo 1\n\nCena inicial no porto.',
        tags: ['livro', 'ideias'],
        link: { type: 'goal', id: nid(50), label: 'Escrever o livro' },
        updatedAt: '2026-10-07T15:00:00.000Z',
      }),
    ]);
    setup(fake);

    const link = await screen.findByRole('link', { name: /Ideias do livro/ });
    expect(link).toHaveAttribute('href', `/notas/${nid(1)}`);
    expect(link).toHaveTextContent('Capítulo 1 Cena inicial no porto.');
    expect(link).toHaveTextContent('Meta: Escrever o livro');
    expect(link).toHaveTextContent('#livro');
    expect(link).toHaveTextContent('#ideias');
    expect(link).toHaveTextContent('7 out');
  });

  it('mantém a ordem do servidor (fixadas primeiro)', async () => {
    const fake = makeFakeNotes([
      makeNote({ id: nid(1), title: 'recente', updatedAt: '2026-10-07T12:00:00.000Z' }),
      makeNote({
        id: nid(2),
        title: 'fixada antiga',
        pinned: true,
        updatedAt: '2026-09-01T12:00:00.000Z',
      }),
    ]);
    setup(fake);
    await screen.findByText('recente');
    expect(titles()).toEqual(['fixada antiga', 'recente']);
  });

  describe('busca', () => {
    it('espera a pessoa parar de digitar e então busca, guardando o texto na URL', async () => {
      const fake = makeFakeNotes([
        makeNote({ id: nid(1), title: 'Relatório mensal' }),
        makeNote({ id: nid(2), title: 'Receitas' }),
      ]);
      const { where } = setup(fake);
      await screen.findByText('Receitas');
      const before = listCalls(fake).length;

      await userEvent.type(screen.getByLabelText('Buscar nas notas'), 'relat');

      // logo depois de digitar, ainda não buscou nada: espera a pessoa parar
      expect(
        listCalls(fake)
          .slice(before)
          .some((url) => url.includes('q=')),
      ).toBe(false);
      await waitFor(() => expect(listCalls(fake).at(-1)).toContain('q=relat'));
      // uma busca só (a de cada letra não saiu)
      expect(
        listCalls(fake)
          .slice(before)
          .filter((url) => url.includes('q=')),
      ).toHaveLength(1);
      await waitFor(() => expect(titles()).toEqual(['Relatório mensal']));
      expect(where()).toBe('/notas?q=relat');
    });

    it('começa já com a busca da URL', async () => {
      const fake = makeFakeNotes([makeNote({ id: nid(1), title: 'Relatório mensal' })]);
      setup(fake, '/notas?q=relat');
      expect(await screen.findByLabelText('Buscar nas notas')).toHaveValue('relat');
      await waitFor(() => expect(listCalls(fake)[0]).toContain('q=relat'));
    });

    it('sem resultado, avisa que o filtro não achou nada (diferente de não ter notas)', async () => {
      const fake = makeFakeNotes([makeNote({ id: nid(1), title: 'Relatório' })]);
      setup(fake);
      await screen.findByText('Relatório');
      await userEvent.type(screen.getByLabelText('Buscar nas notas'), 'inexistente');
      expect(
        await screen.findByText('Nenhuma nota encontrada com esse filtro.'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Você ainda não tem notas/)).not.toBeInTheDocument();
    });

    it('limpar a busca volta à lista completa e tira o q da URL', async () => {
      const fake = makeFakeNotes([
        makeNote({ id: nid(1), title: 'Relatório' }),
        makeNote({ id: nid(2), title: 'Receitas' }),
      ]);
      const { where } = setup(fake, '/notas?q=relat');
      await waitFor(() => expect(titles()).toEqual(['Relatório']));

      await userEvent.clear(screen.getByLabelText('Buscar nas notas'));

      await waitFor(() => expect(titles()).toHaveLength(2));
      await waitFor(() => expect(where()).toBe('/notas'));
    });

    it('o campo aceita no máximo 100 caracteres', async () => {
      setup(makeFakeNotes());
      expect(await screen.findByLabelText('Buscar nas notas')).toHaveAttribute('maxlength', '100');
    });
  });

  describe('tags', () => {
    const notes = () => [
      makeNote({ id: nid(1), title: 'a', tags: ['trabalho', 'ideias'] }),
      makeNote({ id: nid(2), title: 'b', tags: ['trabalho'] }),
      makeNote({ id: nid(3), title: 'c', tags: ['livro'] }),
    ];

    it('mostra as tags com a quantidade, da mais usada para a menos usada', async () => {
      setup(makeFakeNotes(notes()));
      const group = await screen.findByRole('group', { name: 'Filtrar por tag' });
      expect(
        within(group)
          .getAllByRole('button')
          .map((b) => b.textContent),
      ).toEqual(['Todas', '#trabalho 2', '#ideias 1', '#livro 1']);
      expect(screen.getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('escolher uma tag filtra no servidor e marca o botão; "Todas" volta', async () => {
      const fake = makeFakeNotes(notes());
      const { where } = setup(fake);
      await screen.findByRole('button', { name: /#trabalho/ });

      await userEvent.click(screen.getByRole('button', { name: /#trabalho/ }));

      await waitFor(() => expect(titles().sort()).toEqual(['a', 'b']));
      expect(listCalls(fake).at(-1)).toContain('tag=trabalho');
      expect(screen.getByRole('button', { name: /#trabalho/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByRole('button', { name: 'Todas' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      expect(where()).toContain('tag=trabalho');

      await userEvent.click(screen.getByRole('button', { name: 'Todas' }));
      await waitFor(() => expect(titles()).toHaveLength(3));
      expect(where()).not.toContain('tag=');
    });

    it('a tag da URL (mesmo digitada com maiúsculas) já vem aplicada', async () => {
      const fake = makeFakeNotes(notes());
      setup(fake, '/notas?tag=Livro');
      await waitFor(() => expect(titles()).toEqual(['c']));
      expect(listCalls(fake)[0]).toContain('tag=livro');
    });

    it('sem nenhuma tag, o grupo de filtros nem aparece', async () => {
      setup(makeFakeNotes([makeNote({ id: nid(1), title: 'a', tags: [] })]));
      await screen.findByText('a');
      expect(screen.queryByRole('group', { name: 'Filtrar por tag' })).not.toBeInTheDocument();
    });
  });

  describe('fixar', () => {
    it('o botão fixa a nota, avisa o estado no próprio botão e a lista reordena', async () => {
      const fake = makeFakeNotes([
        makeNote({ id: nid(1), title: 'nova', updatedAt: '2026-10-07T12:00:00.000Z' }),
        makeNote({ id: nid(2), title: 'antiga', updatedAt: '2026-09-01T12:00:00.000Z' }),
      ]);
      setup(fake);
      await screen.findByText('antiga');
      expect(titles()).toEqual(['nova', 'antiga']);

      await userEvent.click(screen.getByRole('button', { name: 'Fixar nota: antiga' }));

      await waitFor(() => expect(titles()).toEqual(['antiga', 'nova']));
      expect(fake.calls.find((c) => c.method === 'PATCH')).toMatchObject({
        url: `/api/notes/${nid(2)}`,
        body: { pinned: true },
      });
      const unpin = screen.getByRole('button', { name: 'Desafixar nota: antiga' });
      expect(unpin).toHaveAttribute('aria-pressed', 'true');
    });

    it('desafixar devolve a nota ao lugar', async () => {
      const fake = makeFakeNotes([
        makeNote({ id: nid(1), title: 'nova', updatedAt: '2026-10-07T12:00:00.000Z' }),
        makeNote({
          id: nid(2),
          title: 'antiga',
          pinned: true,
          updatedAt: '2026-09-01T12:00:00.000Z',
        }),
      ]);
      setup(fake);
      await screen.findByText('antiga');
      await userEvent.click(screen.getByRole('button', { name: 'Desafixar nota: antiga' }));
      await waitFor(() => expect(titles()).toEqual(['nova', 'antiga']));
    });

    it('no limite de fixadas, mostra o motivo e a lista não muda', async () => {
      const fake = makeFakeNotes([makeNote({ id: nid(1), title: 'a' })]);
      fake.failNext = {
        method: 'PATCH',
        status: 409,
        message: 'Você já fixou 20 notas. Desafixe uma para fixar outra',
      };
      setup(fake);
      await screen.findByText('a');

      await userEvent.click(screen.getByRole('button', { name: 'Fixar nota: a' }));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          'Você já fixou 20 notas. Desafixe uma para fixar outra',
        ),
      );
      expect(screen.getByRole('button', { name: 'Fixar nota: a' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });
  });

  it('"Carregar mais" traz a página seguinte pelo cursor e some no fim', async () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      makeNote({
        id: nid(i + 1),
        title: `nota ${String(i + 1).padStart(2, '0')}`,
        updatedAt: `2026-10-${String(1 + (i % 28)).padStart(2, '0')}T12:00:00.000Z`,
      }),
    );
    const fake = makeFakeNotes(many);
    setup(fake);
    await screen.findAllByRole('listitem');
    expect(titles()).toHaveLength(20);

    await userEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));

    await waitFor(() => expect(titles()).toHaveLength(25));
    expect(new Set(titles()).size).toBe(25);
    expect(listCalls(fake).at(-1)).toContain('before=');
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument();
  });

  it('falha ao carregar mostra o erro e permite tentar de novo', async () => {
    setup(makeFakeNotes(), '/notas', 500);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar as notas.',
    );
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});
