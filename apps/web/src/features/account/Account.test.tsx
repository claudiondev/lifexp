import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionInfo, User } from '@lifexp/shared';
import { json } from '@/features/goals/testing';
import { setAccessToken } from '@/lib/apiClient';
import { AuthContext, type AuthContextValue } from '../auth/AuthContext';
import { DataExportCard } from './DataExportCard';
import { CONFIRM_WORD, DeleteAccountCard } from './DeleteAccountCard';
import { SessionsCard } from './SessionsCard';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast, Toaster: () => null }));

const NOW = new Date('2026-10-07T18:00:00.000Z'); // quarta 15:00 em São Paulo
const sid = (n: number) => `0192f1a0-7b3c-7000-8000-00000000000${n}`;

const USER = {
  id: sid(9),
  name: 'Ana',
  email: 'ana@test.dev',
  timezone: 'America/Sao_Paulo',
  avatarKey: 'swords',
  createdAt: '2026-01-01T00:00:00.000Z',
} as User;

const session = (n: number, over: Partial<SessionInfo> = {}): SessionInfo => ({
  id: sid(n),
  device: 'Chrome · Windows',
  createdAt: '2026-10-01T12:00:00.000Z',
  lastUsedAt: '2026-10-07T17:55:00.000Z',
  current: false,
  ...over,
});

function wrap(children: ReactNode, logout = vi.fn(async () => {})) {
  const auth: AuthContextValue = {
    state: { status: 'authenticated', user: USER },
    login: vi.fn(),
    register: vi.fn(),
    logout,
    updateProfile: vi.fn(),
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
    </QueryClientProvider>,
  );
  return { logout };
}

describe('conta e sessões (telas)', () => {
  beforeEach(() => {
    setAccessToken('token');
    toast.success.mockClear();
    toast.error.mockClear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('SessionsCard', () => {
    /** API falsa: guarda a lista e a atualiza como o servidor faria. */
    function setup(
      initial: SessionInfo[],
      options: { listStatus?: number; revokeStatus?: number } = {},
    ) {
      let sessions = [...initial];
      const calls: { method: string; url: string }[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>(async (input, init) => {
          const url = String(input);
          const method = init?.method ?? 'GET';
          calls.push({ method, url });
          if (url === '/api/auth/sessions' && method === 'GET') {
            if (options.listStatus) return json(options.listStatus, { message: 'falhou' });
            return json(200, sessions);
          }
          if (url === '/api/auth/sessions/revoke-others') {
            const others = sessions.filter((s) => !s.current);
            sessions = sessions.filter((s) => s.current);
            return json(200, { revoked: others.length });
          }
          const one = /^\/api\/auth\/sessions\/(.+)$/.exec(url);
          if (one && method === 'DELETE') {
            if (options.revokeStatus)
              return json(options.revokeStatus, { message: 'Sessão não encontrada' });
            sessions = sessions.filter((s) => s.id !== one[1]);
            return new Response(null, { status: 204 });
          }
          return json(404);
        }),
      );
      wrap(<SessionsCard />);
      return { calls };
    }

    const list = () => screen.findByRole('list');

    it('mostra cada aparelho, marca a sessão atual e só oferece encerrar as outras', async () => {
      setup([
        session(1, { current: true }),
        session(2, { device: 'Safari · iOS', createdAt: '2026-09-20T12:00:00.000Z' }),
      ]);

      const rows = within(await list()).getAllByRole('listitem');
      expect(rows).toHaveLength(2);
      expect(rows[0]).toHaveTextContent('Chrome · Windows');
      expect(rows[0]).toHaveTextContent('Esta sessão');
      expect(rows[0]).toHaveTextContent('Entrou em 1 de outubro de 2026');
      expect(rows[0]).toHaveTextContent('usada há 5 min');
      expect(within(rows[0]!).queryByRole('button')).not.toBeInTheDocument();
      expect(rows[1]).toHaveTextContent('Safari · iOS');
      expect(rows[1]).toHaveTextContent('Entrou em 20 de setembro de 2026');
      expect(rows[1]).not.toHaveTextContent('Esta sessão');
      expect(
        within(rows[1]!).getByRole('button', { name: 'Encerrar sessão: Safari · iOS' }),
      ).toBeInTheDocument();
    });

    it('a data de entrada respeita o fuso da pessoa (perto da meia-noite)', async () => {
      // 02:30 UTC de 2 de outubro ainda é 1 de outubro, 23:30, em São Paulo
      setup([session(1, { current: true, createdAt: '2026-10-02T02:30:00.000Z' })]);
      expect(await screen.findByText(/Entrou em 1 de outubro de 2026/)).toBeInTheDocument();
    });

    it('encerrar um aparelho chama a API, avisa e tira o aparelho da lista', async () => {
      const user = userEvent.setup();
      const { calls } = setup([
        session(1, { current: true }),
        session(2, { device: 'Safari · iOS' }),
      ]);
      await list();

      await user.click(screen.getByRole('button', { name: 'Encerrar sessão: Safari · iOS' }));

      await waitFor(() => expect(screen.queryByText('Safari · iOS')).not.toBeInTheDocument());
      expect(calls).toContainEqual({ method: 'DELETE', url: `/api/auth/sessions/${sid(2)}` });
      expect(toast.success).toHaveBeenCalledWith('Sessão encerrada');
      expect(screen.getByText('Chrome · Windows')).toBeInTheDocument();
    });

    it('"Encerrar todas as outras" derruba as outras, avisa quantas e esconde o botão', async () => {
      const user = userEvent.setup();
      const { calls } = setup([
        session(1, { current: true }),
        session(2, { device: 'Safari · iOS' }),
        session(3, { device: 'Firefox · Linux' }),
      ]);
      await list();

      await user.click(screen.getByRole('button', { name: 'Encerrar todas as outras' }));

      await waitFor(() =>
        expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1),
      );
      expect(calls).toContainEqual({ method: 'POST', url: '/api/auth/sessions/revoke-others' });
      expect(toast.success).toHaveBeenCalledWith('2 sessões encerradas');
      expect(
        screen.queryByRole('button', { name: 'Encerrar todas as outras' }),
      ).not.toBeInTheDocument();
    });

    it('no singular quando é só uma', async () => {
      const user = userEvent.setup();
      setup([session(1, { current: true }), session(2)]);
      await list();
      await user.click(screen.getByRole('button', { name: 'Encerrar todas as outras' }));
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('1 sessão encerrada'));
    });

    it('só a sessão atual: não oferece encerrar as outras', async () => {
      setup([session(1, { current: true })]);
      await list();
      expect(screen.queryByRole('button', { name: /Encerrar/ })).not.toBeInTheDocument();
    });

    it('erro ao encerrar aparece como aviso e a lista continua igual', async () => {
      const user = userEvent.setup();
      setup([session(1, { current: true }), session(2, { device: 'Safari · iOS' })], {
        revokeStatus: 404,
      });
      await list();

      await user.click(screen.getByRole('button', { name: 'Encerrar sessão: Safari · iOS' }));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Sessão não encontrada'));
      expect(toast.success).not.toHaveBeenCalled();
      expect(screen.getByText('Safari · iOS')).toBeInTheDocument();
    });

    it('falha ao carregar mostra o erro e permite tentar de novo', async () => {
      setup([], { listStatus: 500 });
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Não foi possível carregar os dispositivos.',
      );
      expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
    });
  });

  describe('DataExportCard', () => {
    function setup(response: () => Response) {
      const downloaded: { download: string; href: string }[] = [];
      vi.stubGlobal(
        'URL',
        Object.assign(URL, {
          createObjectURL: vi.fn(() => 'blob:lifexp'),
          revokeObjectURL: vi.fn(),
        }),
      );
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        downloaded.push({ download: this.download, href: this.href });
      });
      const fetchMock = vi.fn<typeof fetch>(async (input) =>
        String(input) === '/api/users/me/export' ? response() : json(404),
      );
      vi.stubGlobal('fetch', fetchMock);
      wrap(<DataExportCard />);
      return { downloaded, fetchMock };
    }

    const ok = () =>
      new Response(JSON.stringify({ version: 1 }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="lifexp-dados-2026-10-07.json"',
        },
      });

    it('baixa o arquivo com o nome que a API mandou e avisa', async () => {
      const user = userEvent.setup();
      const { downloaded } = setup(ok);

      await user.click(screen.getByRole('button', { name: 'Baixar meus dados' }));

      await waitFor(() => expect(downloaded).toHaveLength(1));
      expect(downloaded[0]).toEqual({
        download: 'lifexp-dados-2026-10-07.json',
        href: 'blob:lifexp',
      });
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:lifexp');
      expect(toast.success).toHaveBeenCalledWith('Seus dados foram baixados');
      expect(screen.getByRole('button', { name: 'Baixar meus dados' })).toBeEnabled();
    });

    it('sem o cabeçalho de nome, usa um nome padrão', async () => {
      const user = userEvent.setup();
      const { downloaded } = setup(() => json(200, { version: 1 }));
      await user.click(screen.getByRole('button', { name: 'Baixar meus dados' }));
      await waitFor(() => expect(downloaded[0]?.download).toBe('lifexp-dados.json'));
    });

    it('erro do servidor vira aviso e nada é baixado', async () => {
      const user = userEvent.setup();
      const { downloaded } = setup(() => json(429, { message: 'Muitas tentativas.' }));

      await user.click(screen.getByRole('button', { name: 'Baixar meus dados' }));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Muitas tentativas.'));
      expect(downloaded).toHaveLength(0);
      expect(toast.success).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Baixar meus dados' })).toBeEnabled();
    });

    it('explica que senhas e tokens nunca entram no arquivo', () => {
      setup(ok);
      expect(screen.getByText(/Senhas e tokens nunca entram no arquivo/)).toBeInTheDocument();
    });
  });

  describe('DeleteAccountCard', () => {
    function setup(response: () => Response = () => new Response(null, { status: 204 })) {
      const posts: Record<string, unknown>[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>(async (input, init) => {
          if (String(input) === '/api/users/me/delete' && init?.method === 'POST') {
            posts.push(JSON.parse(String(init.body)));
            return response();
          }
          return json(404);
        }),
      );
      const { logout } = wrap(<DeleteAccountCard />);
      return { posts, logout };
    }

    const open = () => userEvent.click(screen.getByRole('button', { name: 'Excluir minha conta' }));
    const fill = async (password: string, word: string) => {
      await userEvent.type(screen.getByLabelText('Sua senha'), password);
      await userEvent.type(screen.getByLabelText(`Digite ${CONFIRM_WORD} para confirmar`), word);
    };
    const confirm = () => screen.getByRole('button', { name: 'Excluir para sempre' });

    it('avisa que é sem volta e só libera o botão com a senha e a palavra certa', async () => {
      setup();
      await open();
      expect(screen.getByText(/Não dá para desfazer/)).toBeInTheDocument();
      expect(confirm()).toBeDisabled();

      await userEvent.type(screen.getByLabelText('Sua senha'), 'minha-senha-1');
      expect(confirm()).toBeDisabled(); // falta a palavra

      await userEvent.type(
        screen.getByLabelText(`Digite ${CONFIRM_WORD} para confirmar`),
        'excluir',
      );
      expect(confirm()).toBeDisabled(); // minúsculas não valem

      await userEvent.clear(screen.getByLabelText(`Digite ${CONFIRM_WORD} para confirmar`));
      await userEvent.type(
        screen.getByLabelText(`Digite ${CONFIRM_WORD} para confirmar`),
        CONFIRM_WORD,
      );
      expect(confirm()).toBeEnabled();
    });

    it('sem senha, mesmo com a palavra, continua bloqueado', async () => {
      setup();
      await open();
      await userEvent.type(
        screen.getByLabelText(`Digite ${CONFIRM_WORD} para confirmar`),
        CONFIRM_WORD,
      );
      expect(confirm()).toBeDisabled();
    });

    it('exclui com a senha, avisa e sai da conta', async () => {
      const { posts, logout } = setup();
      await open();
      await fill('minha-senha-1', CONFIRM_WORD);

      await userEvent.click(confirm());

      await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
      expect(posts).toEqual([{ password: 'minha-senha-1' }]);
      expect(toast.success).toHaveBeenCalledWith('Conta excluída. Seus dados foram apagados.');
    });

    it('senha errada mostra o motivo, mantém o diálogo e não sai da conta', async () => {
      const { logout } = setup(() => json(403, { message: 'Senha incorreta' }));
      await open();
      await fill('errada-1234', CONFIRM_WORD);

      await userEvent.click(confirm());

      expect(await screen.findByRole('alert')).toHaveTextContent('Senha incorreta');
      expect(logout).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(confirm()).toBeEnabled(); // dá para tentar de novo
    });

    it('cancelar fecha sem chamar a API, e ao reabrir o formulário está vazio', async () => {
      const { posts } = setup();
      await open();
      await fill('minha-senha-1', CONFIRM_WORD);

      await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await open();

      expect(screen.getByLabelText('Sua senha')).toHaveValue('');
      expect(screen.getByLabelText(`Digite ${CONFIRM_WORD} para confirmar`)).toHaveValue('');
      expect(posts).toHaveLength(0);
    });

    it('a senha é um campo de senha (não aparece na tela)', async () => {
      setup();
      await open();
      expect(screen.getByLabelText('Sua senha')).toHaveAttribute('type', 'password');
    });
  });
});
