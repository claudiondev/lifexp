import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@lifexp/shared';
import { AuthContext, type AuthContextValue } from '@/features/auth/AuthContext';
import { AREAS, GOAL_ID, json, makeGoal } from '@/features/goals/testing';
import { NOTE_ID, makeFakeNotes, makeNote, type FakeNotes } from '@/features/notes/testing';
import { setAccessToken } from '@/lib/apiClient';
import { NoteEditorPage } from './NoteEditorPage';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast, Toaster: () => null }));

const EVENT_ID = '0192f1a0-7b3c-7000-8000-0000000000f1';
const BLOCK_ID = '0192f1a0-7b3c-7000-8000-0000000000f2';
const USER = {
  id: '0192f1a0-7b3c-7000-8000-000000000009',
  name: 'Ana',
  email: 'ana@test.dev',
  timezone: 'America/Sao_Paulo',
  avatarKey: 'swords',
  createdAt: '2026-01-01T00:00:00.000Z',
} as User;

function setup(fake: FakeNotes, entry: string, options: { noteStatus?: number } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (options.noteStatus && /^\/api\/notes\/[0-9a-f-]{36}$/.test(url) && !init?.method) {
        return json(options.noteStatus, {
          message: options.noteStatus === 404 ? 'Nota não encontrada' : 'falhou',
        });
      }
      const handled = fake.handle(url, init);
      if (handled) return handled;
      if (url.startsWith('/api/areas')) return json(200, AREAS);
      if (url.startsWith('/api/goals')) {
        return json(200, [makeGoal({ id: GOAL_ID, title: 'Ler 12 livros' })]);
      }
      if (url.startsWith('/api/events')) {
        return json(200, [
          {
            id: EVENT_ID,
            areaId: null,
            title: 'Consulta médica',
            notes: null,
            date: '2026-10-20',
            time: null,
            category: 'medical',
            remindBeforeMin: null,
          },
        ]);
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
          <Routes>
            <Route path="/notas" element={<p>Lista de notas</p>} />
            <Route path="/notas/nova" element={<NoteEditorPage />} />
            <Route path="/notas/:noteId" element={<NoteEditorPage />} />
          </Routes>
          <Where />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
  return { where: () => where };
}

const posts = (fake: FakeNotes) => fake.calls.filter((c) => c.method === 'POST');
const patches = (fake: FakeNotes) => fake.calls.filter((c) => c.method === 'PATCH');
const title = () => screen.findByLabelText('Título');
const typeTag = async (text: string) => {
  const input = screen.getByLabelText('Tags');
  await userEvent.type(input, text);
};

describe('NoteEditorPage', () => {
  beforeEach(() => {
    setAccessToken('token');
    toast.success.mockClear();
    toast.error.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  describe('nota nova', () => {
    it('exige o título e não chama a API sem ele', async () => {
      const fake = makeFakeNotes();
      setup(fake, '/notas/nova');
      await title();

      await userEvent.click(screen.getByRole('button', { name: 'Criar nota' }));

      expect(await screen.findByText('Dê um título à nota')).toBeInTheDocument();
      expect(posts(fake)).toHaveLength(0);
      await userEvent.type(screen.getByLabelText('Título'), '   ');
      await userEvent.click(screen.getByRole('button', { name: 'Criar nota' }));
      expect(posts(fake)).toHaveLength(0);
    });

    it('cria com título, texto, tags e fixada, avisa e abre a nota criada', async () => {
      const fake = makeFakeNotes();
      const { where } = setup(fake, '/notas/nova');
      await userEvent.type(await title(), 'Reunião de equipe');
      await userEvent.type(screen.getByLabelText('Texto (markdown)'), '# Pauta{enter}- item');
      await typeTag('trabalho{enter}');
      await userEvent.click(screen.getByRole('switch', { name: 'Fixar no topo da lista' }));

      await userEvent.click(screen.getByRole('button', { name: 'Criar nota' }));

      await waitFor(() => expect(posts(fake)).toHaveLength(1));
      expect(posts(fake)[0]!.body).toEqual({
        title: 'Reunião de equipe',
        content: '# Pauta\n- item',
        tags: ['trabalho'],
        pinned: true,
      });
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Nota criada'));
      await waitFor(() => expect(where()).toMatch(/^\/notas\/0192f1a0/));
      expect(where()).not.toBe('/notas/nova');
    });

    it('a nota nasce sem vínculo (não manda o campo) e com texto vazio se nada foi escrito', async () => {
      const fake = makeFakeNotes();
      setup(fake, '/notas/nova');
      await userEvent.type(await title(), 'Só o título');
      await userEvent.click(screen.getByRole('button', { name: 'Criar nota' }));
      await waitFor(() => expect(posts(fake)).toHaveLength(1));
      expect(posts(fake)[0]!.body).toEqual({
        title: 'Só o título',
        content: '',
        tags: [],
        pinned: false,
      });
    });

    it('erro do servidor aparece e o que foi digitado continua lá', async () => {
      const fake = makeFakeNotes();
      fake.failNext = {
        method: 'POST',
        status: 409,
        message: 'Você já fixou 20 notas. Desafixe uma para fixar outra',
      };
      const { where } = setup(fake, '/notas/nova');
      await userEvent.type(await title(), 'Importante');
      await userEvent.click(screen.getByRole('switch', { name: 'Fixar no topo da lista' }));

      await userEvent.click(screen.getByRole('button', { name: 'Criar nota' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Desafixe uma');
      expect(screen.getByLabelText('Título')).toHaveValue('Importante');
      expect(where()).toBe('/notas/nova');
      expect(toast.success).not.toHaveBeenCalled();
    });

    it('o título e o texto têm limite de caracteres no campo', async () => {
      setup(makeFakeNotes(), '/notas/nova');
      expect(await title()).toHaveAttribute('maxlength', '200');
      expect(screen.getByLabelText('Texto (markdown)')).toHaveAttribute('maxlength', '20000');
    });
  });

  describe('tags', () => {
    it('Enter e vírgula fecham a tag, que é normalizada; repetida é ignorada; dá para remover', async () => {
      setup(makeFakeNotes(), '/notas/nova');
      await title();

      await typeTag('#Saúde Mental{enter}');
      await typeTag('trabalho,');
      await typeTag('SAÚDE MENTAL{enter}');

      const list = screen.getByRole('list', { name: 'Tags da nota' });
      expect(
        within(list)
          .getAllByRole('listitem')
          .map((li) => li.textContent),
      ).toEqual(['#saúde-mental', '#trabalho']);
      expect(screen.getByLabelText('Tags')).toHaveValue('');

      await userEvent.click(screen.getByRole('button', { name: 'Remover a tag trabalho' }));
      expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    });

    it('colar várias separadas por vírgula entra todas de uma vez', async () => {
      setup(makeFakeNotes(), '/notas/nova');
      await title();
      fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'a, b, c,' } });
      expect(
        within(screen.getByRole('list', { name: 'Tags da nota' })).getAllByRole('listitem'),
      ).toHaveLength(3);
    });

    it('sair do campo também fecha a tag digitada', async () => {
      setup(makeFakeNotes(), '/notas/nova');
      await title();
      await typeTag('rascunho');
      await userEvent.click(screen.getByLabelText('Título'));
      expect(screen.getByRole('list', { name: 'Tags da nota' })).toHaveTextContent('#rascunho');
    });

    it('tag inválida mostra o motivo e não entra; o texto digitado fica para corrigir', async () => {
      setup(makeFakeNotes(), '/notas/nova');
      await title();
      await typeTag('ruim!{enter}');
      expect(await screen.findByText('Use só letras, números, "-" e "_"')).toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'Tags da nota' })).not.toBeInTheDocument();
      expect(screen.getByLabelText('Tags')).toHaveValue('ruim!');
    });

    it('no máximo 10 tags', async () => {
      setup(makeFakeNotes(), '/notas/nova');
      await title();
      for (let i = 0; i < 10; i += 1) await typeTag(`t${i}{enter}`);
      await typeTag('extra{enter}');
      expect(await screen.findByText('No máximo 10 tags')).toBeInTheDocument();
      expect(
        within(screen.getByRole('list', { name: 'Tags da nota' })).getAllByRole('listitem'),
      ).toHaveLength(10);
    });

    it('sugere as tags que a pessoa já usa (menos as que já estão na nota)', async () => {
      const fake = makeFakeNotes([makeNote({ id: NOTE_ID, tags: ['livro', 'ideias'] })]);
      setup(fake, '/notas/nova');
      await title();
      await waitFor(() => expect(document.querySelectorAll('datalist option')).toHaveLength(2));
      await typeTag('livro{enter}');
      await waitFor(() =>
        expect(
          [...document.querySelectorAll('datalist option')].map((o) => o.getAttribute('value')),
        ).toEqual(['ideias']),
      );
    });
  });

  describe('visualização do markdown', () => {
    it('alterna entre escrever e visualizar, mostrando o markdown formatado', async () => {
      setup(makeFakeNotes(), '/notas/nova');
      fireEvent.change(await screen.findByLabelText('Texto (markdown)'), {
        target: { value: '# Plano\n\n- **item** um' },
      });

      await userEvent.click(screen.getByRole('tab', { name: 'Visualizar' }));

      const preview = screen.getByRole('tabpanel', { name: 'Visualização' });
      expect(within(preview).getByRole('heading', { level: 2, name: 'Plano' })).toBeInTheDocument();
      expect(preview.querySelector('strong')).toHaveTextContent('item');
      expect(screen.queryByLabelText('Texto (markdown)')).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('tab', { name: 'Escrever' }));
      expect(screen.getByLabelText('Texto (markdown)')).toHaveValue('# Plano\n\n- **item** um');
    });

    it('a visualização é segura: script e link perigoso não viram nada executável', async () => {
      setup(makeFakeNotes(), '/notas/nova');
      fireEvent.change(await screen.findByLabelText('Texto (markdown)'), {
        target: {
          value: '<script>alert(1)</script> [x](javascript:alert(1)) <img src=x onerror=alert(1)>',
        },
      });
      await userEvent.click(screen.getByRole('tab', { name: 'Visualizar' }));
      const preview = screen.getByRole('tabpanel', { name: 'Visualização' });
      expect(preview.querySelector('script')).toBeNull();
      expect(preview.querySelector('a')).toBeNull();
      expect(preview.querySelector('img')).toBeNull();
    });

    it('texto vazio avisa que não há o que mostrar', async () => {
      setup(makeFakeNotes(), '/notas/nova');
      await title();
      await userEvent.click(screen.getByRole('tab', { name: 'Visualizar' }));
      expect(screen.getByText('Nada para mostrar ainda.')).toBeInTheDocument();
    });
  });

  describe('vínculo', () => {
    it('vincula a uma meta e envia o vínculo', async () => {
      const fake = makeFakeNotes();
      setup(fake, '/notas/nova');
      await userEvent.type(await title(), 'Sobre a meta');
      await userEvent.selectOptions(screen.getByLabelText('Vínculo'), 'Meta');
      await userEvent.selectOptions(await screen.findByLabelText('Meta'), 'Ler 12 livros');

      await userEvent.click(screen.getByRole('button', { name: 'Criar nota' }));

      await waitFor(() => expect(posts(fake)).toHaveLength(1));
      expect(posts(fake)[0]!.body).toMatchObject({ link: { type: 'goal', id: GOAL_ID } });
    });

    it('vincula a uma área e a um evento', async () => {
      const fake = makeFakeNotes();
      setup(fake, '/notas/nova');
      await userEvent.type(await title(), 'a');
      await userEvent.selectOptions(screen.getByLabelText('Vínculo'), 'Evento');
      await userEvent.selectOptions(await screen.findByLabelText('Evento'), 'Consulta médica');
      await userEvent.selectOptions(screen.getByLabelText('Vínculo'), 'Área');
      await userEvent.selectOptions(await screen.findByLabelText('Área'), 'Estudo');
      await userEvent.click(screen.getByRole('button', { name: 'Criar nota' }));
      await waitFor(() => expect(posts(fake)).toHaveLength(1));
      expect(posts(fake)[0]!.body).toMatchObject({ link: { type: 'area', id: AREAS[0]!.id } });
    });

    it('escolher o tipo sem escolher o alvo não envia vínculo (e "Sem vínculo" limpa)', async () => {
      const fake = makeFakeNotes();
      setup(fake, '/notas/nova');
      await userEvent.type(await title(), 'a');
      await userEvent.selectOptions(screen.getByLabelText('Vínculo'), 'Meta');
      await userEvent.click(screen.getByRole('button', { name: 'Criar nota' }));
      await waitFor(() => expect(posts(fake)).toHaveLength(1));
      expect(posts(fake)[0]!.body).not.toHaveProperty('link');

      expect(screen.queryByLabelText('Meta')).not.toBeInTheDocument(); // já navegou
    });

    it('"Sem vínculo" remove a escolha anterior', async () => {
      setup(makeFakeNotes(), '/notas/nova');
      await title();
      await userEvent.selectOptions(screen.getByLabelText('Vínculo'), 'Meta');
      expect(await screen.findByLabelText('Meta')).toBeInTheDocument();
      await userEvent.selectOptions(screen.getByLabelText('Vínculo'), 'Sem vínculo');
      expect(screen.queryByLabelText('Meta')).not.toBeInTheDocument();
    });

    it('o atalho "Anotar" abre o editor já vinculado à meta', async () => {
      const fake = makeFakeNotes();
      setup(fake, `/notas/nova?goalId=${GOAL_ID}&rotulo=Ler+12+livros`);
      await userEvent.type(await title(), 'Resumo do capítulo');
      expect(await screen.findByLabelText('Vínculo')).toHaveValue('goal');
      await waitFor(() => expect(screen.getByLabelText('Meta')).toHaveValue(GOAL_ID));

      await userEvent.click(screen.getByRole('button', { name: 'Criar nota' }));

      await waitFor(() => expect(posts(fake)).toHaveLength(1));
      expect(posts(fake)[0]!.body).toMatchObject({ link: { type: 'goal', id: GOAL_ID } });
    });

    it('o atalho de um bloco mostra o vínculo fixo, que dá para remover', async () => {
      const fake = makeFakeNotes();
      setup(fake, `/notas/nova?blockId=${BLOCK_ID}&rotulo=Corrida`);
      await userEvent.type(await title(), 'Como foi a corrida');
      expect(await screen.findByText('Bloco: Corrida')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Remover o vínculo com o bloco' }));
      expect(screen.queryByText('Bloco: Corrida')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Vínculo')).toHaveValue('');

      await userEvent.click(screen.getByRole('button', { name: 'Criar nota' }));
      await waitFor(() => expect(posts(fake)).toHaveLength(1));
      expect(posts(fake)[0]!.body).not.toHaveProperty('link');
    });

    it('o atalho de um bloco envia o vínculo com o bloco', async () => {
      const fake = makeFakeNotes();
      setup(fake, `/notas/nova?blockId=${BLOCK_ID}&rotulo=Corrida`);
      await userEvent.type(await title(), 'x');
      await userEvent.click(screen.getByRole('button', { name: 'Criar nota' }));
      await waitFor(() => expect(posts(fake)).toHaveLength(1));
      expect(posts(fake)[0]!.body).toMatchObject({ link: { type: 'block', id: BLOCK_ID } });
    });

    it('parâmetro de vínculo malformado na URL é ignorado', async () => {
      setup(makeFakeNotes(), '/notas/nova?goalId=nao-e-uuid&rotulo=x');
      await title();
      expect(screen.getByLabelText('Vínculo')).toHaveValue('');
    });
  });

  describe('nota existente', () => {
    const existing = () =>
      makeNote({
        id: NOTE_ID,
        title: 'Ideias do livro',
        content: 'texto antigo',
        tags: ['livro'],
        link: { type: 'goal', id: GOAL_ID, label: 'Ler 12 livros' },
      });

    it('carrega os campos e só libera "Salvar" quando algo muda', async () => {
      setup(makeFakeNotes([existing()]), `/notas/${NOTE_ID}`);

      expect(await screen.findByDisplayValue('Ideias do livro')).toBeInTheDocument();
      expect(screen.getByLabelText('Texto (markdown)')).toHaveValue('texto antigo');
      expect(screen.getByRole('list', { name: 'Tags da nota' })).toHaveTextContent('#livro');
      expect(screen.getByLabelText('Vínculo')).toHaveValue('goal');
      expect(screen.getByText('Tudo salvo')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();

      await userEvent.type(screen.getByLabelText('Título'), '!');
      expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled();
      expect(screen.queryByText('Tudo salvo')).not.toBeInTheDocument();
    });

    it('só adicionar uma tag já é uma alteração que pode ser salva', async () => {
      const fake = makeFakeNotes([existing()]);
      setup(fake, `/notas/${NOTE_ID}`);
      await screen.findByDisplayValue('Ideias do livro');
      expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();

      await typeTag('nova{enter}');
      expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled();
      await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

      await waitFor(() => expect(patches(fake)).toHaveLength(1));
      expect(patches(fake)[0]!.body).toMatchObject({ tags: ['livro', 'nova'] });
    });

    it('remover uma tag também', async () => {
      const fake = makeFakeNotes([existing()]);
      setup(fake, `/notas/${NOTE_ID}`);
      await screen.findByDisplayValue('Ideias do livro');
      await userEvent.click(screen.getByRole('button', { name: 'Remover a tag livro' }));
      expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled();
    });

    it('salva as mudanças, avisa e volta a "Tudo salvo"', async () => {
      const fake = makeFakeNotes([existing()]);
      setup(fake, `/notas/${NOTE_ID}`);
      const input = await screen.findByDisplayValue('Ideias do livro');
      await userEvent.clear(input);
      await userEvent.type(input, 'Ideias revisadas');
      fireEvent.change(screen.getByLabelText('Texto (markdown)'), {
        target: { value: 'texto novo' },
      });
      await typeTag('extra{enter}');

      await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

      await waitFor(() => expect(patches(fake)).toHaveLength(1));
      expect(patches(fake)[0]).toMatchObject({
        url: `/api/notes/${NOTE_ID}`,
        body: {
          title: 'Ideias revisadas',
          content: 'texto novo',
          tags: ['livro', 'extra'],
          pinned: false,
          link: { type: 'goal', id: GOAL_ID },
        },
      });
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Nota salva'));
      expect(await screen.findByText('Tudo salvo')).toBeInTheDocument();
    });

    it('desvincular envia link nulo', async () => {
      const fake = makeFakeNotes([existing()]);
      setup(fake, `/notas/${NOTE_ID}`);
      await screen.findByDisplayValue('Ideias do livro');
      await userEvent.selectOptions(screen.getByLabelText('Vínculo'), 'Sem vínculo');
      await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
      await waitFor(() => expect(patches(fake)).toHaveLength(1));
      expect(patches(fake)[0]!.body).toMatchObject({ link: null });
    });

    it('a meta vinculada continua escolhível mesmo fora da lista de metas', async () => {
      const gone = makeNote({
        id: NOTE_ID,
        link: {
          type: 'goal',
          id: '0192f1a0-7b3c-7000-8000-0000000000aa',
          label: 'Meta já concluída',
        },
      });
      setup(makeFakeNotes([gone]), `/notas/${NOTE_ID}`);
      await screen.findByDisplayValue('Ideias do livro');
      const select = await screen.findByLabelText('Meta');
      expect(within(select).getByRole('option', { name: 'Meta já concluída' })).toBeInTheDocument();
      expect(select).toHaveValue('0192f1a0-7b3c-7000-8000-0000000000aa');
    });

    it('uma nota vinculada a um bloco mostra o vínculo e permite remover', async () => {
      const fake = makeFakeNotes([
        makeNote({ id: NOTE_ID, link: { type: 'block', id: BLOCK_ID, label: 'Corrida' } }),
      ]);
      setup(fake, `/notas/${NOTE_ID}`);
      expect(await screen.findByText('Bloco: Corrida')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Remover o vínculo com o bloco' }));
      await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
      await waitFor(() => expect(patches(fake)).toHaveLength(1));
      expect(patches(fake)[0]!.body).toMatchObject({ link: null });
    });

    it('fixar é uma alteração que pode ser salva', async () => {
      const fake = makeFakeNotes([existing()]);
      setup(fake, `/notas/${NOTE_ID}`);
      await screen.findByDisplayValue('Ideias do livro');
      await userEvent.click(screen.getByRole('switch', { name: 'Fixar no topo da lista' }));
      await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
      await waitFor(() => expect(patches(fake)).toHaveLength(1));
      expect(patches(fake)[0]!.body).toMatchObject({ pinned: true });
    });

    it('erro ao salvar aparece e a edição não se perde', async () => {
      const fake = makeFakeNotes([existing()]);
      fake.failNext = { method: 'PATCH', status: 404, message: 'Meta não encontrada' };
      setup(fake, `/notas/${NOTE_ID}`);
      const input = await screen.findByDisplayValue('Ideias do livro');
      await userEvent.type(input, ' novo');
      await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Meta não encontrada');
      expect(screen.getByLabelText('Título')).toHaveValue('Ideias do livro novo');
      expect(toast.success).not.toHaveBeenCalled();
    });

    it('excluir pede confirmação, apaga e volta para a lista', async () => {
      const fake = makeFakeNotes([existing()]);
      const { where } = setup(fake, `/notas/${NOTE_ID}`);
      await screen.findByDisplayValue('Ideias do livro');

      await userEvent.click(screen.getByRole('button', { name: 'Excluir' }));
      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent('“Ideias do livro” será apagada para sempre');
      expect(fake.calls.some((c) => c.method === 'DELETE')).toBe(false);
      await userEvent.click(within(dialog).getByRole('button', { name: 'Excluir nota' }));

      await waitFor(() => expect(fake.notes).toHaveLength(0));
      await waitFor(() => expect(where()).toBe('/notas'));
      expect(toast.success).toHaveBeenCalledWith('Nota excluída');
    });

    it('cancelar a exclusão não apaga nada', async () => {
      const fake = makeFakeNotes([existing()]);
      setup(fake, `/notas/${NOTE_ID}`);
      await screen.findByDisplayValue('Ideias do livro');
      await userEvent.click(screen.getByRole('button', { name: 'Excluir' }));
      await userEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }),
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(fake.notes).toHaveLength(1);
    });

    it('nota que não existe mais: explica e leva de volta à lista', async () => {
      setup(makeFakeNotes(), `/notas/${NOTE_ID}`);
      expect(await screen.findByRole('alert')).toHaveTextContent('Essa nota não existe mais.');
      expect(screen.getByRole('link', { name: 'Notas' })).toHaveAttribute('href', '/notas');
      expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument();
    });

    it('falha ao carregar permite tentar de novo', async () => {
      setup(makeFakeNotes([existing()]), `/notas/${NOTE_ID}`, { noteStatus: 500 });
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Não foi possível carregar a nota.',
      );
      expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
    });
  });
});
