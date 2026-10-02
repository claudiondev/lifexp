import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@lifexp/shared';
import { json } from '@/features/goals/testing';
import { setAccessToken } from '@/lib/apiClient';
import { AuthContext, type AuthContextValue, type AuthState } from './AuthContext';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import { LoginPage } from './LoginPage';
import { ResetPasswordPage } from './ResetPasswordPage';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast, Toaster: () => null }));

const TOKEN = 'Zm9vYmFyLWZvb2Jhci1mb29iYXItZm9vYmFyLWZvb2Jhcg_-';
const USER = { id: 'u1', name: 'Ana', email: 'ana@test.dev' } as User;

interface Call {
  url: string;
  body: Record<string, unknown>;
}

/** Mostra a URL atual, para conferir que o token saiu da barra de endereço. */
function Where() {
  const location = useLocation();
  return (
    <span data-testid="where">{`${location.pathname}${location.search}${location.hash}`}</span>
  );
}

function setup(
  entry: string,
  options: { respond?: (call: Call) => Response; state?: AuthState } = {},
) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const call = { url: String(input), body: JSON.parse(String(init?.body ?? '{}')) };
      calls.push(call);
      return options.respond?.(call) ?? new Response(null, { status: 204 });
    }),
  );
  const auth: AuthContextValue = {
    state: options.state ?? { status: 'anonymous' },
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(async () => {}),
    updateProfile: vi.fn(),
  };
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[entry]}>
        <Where />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
          <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return { calls, auth };
}

describe('recuperação de senha (telas)', () => {
  beforeEach(() => {
    setAccessToken(null);
    toast.success.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  describe('login', () => {
    it('oferece "Esqueci minha senha", que leva ao pedido de recuperação', async () => {
      setup('/login');
      await userEvent.click(screen.getByRole('link', { name: 'Esqueci minha senha' }));
      expect(await screen.findByRole('heading', { name: 'Recuperar a senha' })).toBeInTheDocument();
    });
  });

  describe('pedir o link', () => {
    const submit = async (email: string) => {
      await userEvent.type(screen.getByLabelText('E-mail'), email);
      await userEvent.click(screen.getByRole('button', { name: 'Enviar link' }));
    };

    it('envia o e-mail e mostra a mesma confirmação, sem dizer se a conta existe', async () => {
      const { calls } = setup('/esqueci-senha');

      await submit('Ana@Test.dev');

      const status = await screen.findByRole('status');
      expect(status).toHaveTextContent('Se houver uma conta com esse e-mail');
      expect(status).toHaveTextContent('30 minutos');
      expect(status).not.toHaveTextContent(/não cadastrad|não existe|não encontrad/i);
      expect(calls).toEqual([
        { url: '/api/auth/forgot-password', body: { email: 'ana@test.dev' } },
      ]);
      expect(screen.queryByRole('button', { name: 'Enviar link' })).not.toBeInTheDocument();
    });

    it('e-mail inválido não chega ao servidor', async () => {
      const { calls } = setup('/esqueci-senha');
      await submit('ana');
      expect(await screen.findByText('E-mail inválido')).toBeInTheDocument();
      expect(calls).toHaveLength(0);
    });

    it('limite de tentativas (429) aparece como erro e o formulário continua lá', async () => {
      setup('/esqueci-senha', {
        respond: () => json(429, { message: 'Muitas tentativas. Aguarde um minuto.' }),
      });
      await submit('ana@test.dev');
      expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas');
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Enviar link' })).toBeEnabled();
    });
  });

  describe('redefinir', () => {
    const fill = async (password: string, confirm = password) => {
      await userEvent.type(screen.getByLabelText('Nova senha'), password);
      await userEvent.type(screen.getByLabelText('Confirmar a nova senha'), confirm);
      await userEvent.click(screen.getByRole('button', { name: 'Salvar senha nova' }));
    };

    it('tira o token da barra de endereço assim que abre', async () => {
      setup(`/redefinir-senha#token=${TOKEN}`);
      await waitFor(() =>
        expect(screen.getByTestId('where')).toHaveTextContent(/^\/redefinir-senha$/),
      );
      // e continua pronto para redefinir, com o token guardado em memória
      expect(screen.getByRole('heading', { name: 'Criar uma senha nova' })).toBeInTheDocument();
    });

    it('envia o token do link com a senha nova e volta ao login com aviso', async () => {
      const { calls, auth } = setup(`/redefinir-senha#token=${TOKEN}`);

      await fill('senha-nova-123');

      await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/login$/));
      expect(calls).toEqual([
        { url: '/api/auth/reset-password', body: { token: TOKEN, password: 'senha-nova-123' } },
      ]);
      expect(toast.success).toHaveBeenCalledWith('Senha redefinida. Entre com a senha nova.');
      expect(auth.logout).not.toHaveBeenCalled();
    });

    it('com uma sessão aberta neste navegador, sai dela (o servidor encerrou todas)', async () => {
      const { auth } = setup(`/redefinir-senha#token=${TOKEN}`, {
        state: { status: 'authenticated', user: USER },
      });
      await fill('senha-nova-123');
      await waitFor(() => expect(auth.logout).toHaveBeenCalledTimes(1));
    });

    it('senhas diferentes, ou curta demais, não chegam ao servidor', async () => {
      const { calls } = setup(`/redefinir-senha#token=${TOKEN}`);

      await fill('senha-nova-123', 'senha-nova-124');
      expect(await screen.findByText('As senhas não conferem')).toBeInTheDocument();

      await userEvent.clear(screen.getByLabelText('Nova senha'));
      await userEvent.clear(screen.getByLabelText('Confirmar a nova senha'));
      await fill('1234567');
      expect(await screen.findByText('A senha deve ter ao menos 8 caracteres')).toBeInTheDocument();
      expect(calls).toHaveLength(0);
    });

    it('link expirado ou já usado: mostra o erro do servidor e oferece pedir outro', async () => {
      setup(`/redefinir-senha#token=${TOKEN}`, {
        respond: () => json(400, { message: 'Link inválido ou expirado' }),
      });

      await fill('senha-nova-123');

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Link inválido ou expirado');
      expect(toast.success).not.toHaveBeenCalled();
      expect(screen.getByTestId('where')).toHaveTextContent(/^\/redefinir-senha$/);
      await userEvent.click(screen.getByRole('link', { name: 'Pedir um novo link' }));
      expect(await screen.findByRole('heading', { name: 'Recuperar a senha' })).toBeInTheDocument();
    });

    it.each([
      ['sem token', '/redefinir-senha'],
      ['token malformado', '/redefinir-senha#token=curto'],
      ['token na query string (nunca é lido de lá)', `/redefinir-senha?token=${TOKEN}`],
    ])('%s: não mostra o formulário e leva a pedir um novo link', async (_name, entry) => {
      const { calls } = setup(entry);
      expect(screen.getByRole('heading', { name: 'Link inválido' })).toBeInTheDocument();
      expect(screen.queryByLabelText('Nova senha')).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Pedir um novo link' })).toHaveAttribute(
        'href',
        '/esqueci-senha',
      );
      expect(calls).toHaveLength(0);
    });
  });
});
