import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from './lib/apiClient';
import { AuthProvider } from './features/auth/AuthProvider';
import { AppRoutes } from './router';

const user = {
  id: '1',
  name: 'Ana',
  email: 'ana@mail.com',
  timezone: 'UTC',
  avatarKey: 'swords',
  createdAt: '2026-10-01T12:00:00.000Z',
};

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Simula a API por rota. A sessão começa deslogada (refresh responde 401). */
function stubApi(handlers: Record<string, () => Response>) {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const handler = handlers[String(input)];
    return handler ? handler() : json(404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('rotas e telas de auth', () => {
  beforeEach(() => setAccessToken(null));
  afterEach(() => vi.unstubAllGlobals());

  it('redireciona visitante da home para o login', async () => {
    stubApi({ '/api/auth/refresh': () => json(401) });
    renderAt('/');
    expect(
      await screen.findByRole('heading', { name: 'Continue sua jornada' }),
    ).toBeInTheDocument();
  });

  it('restaura a sessão pelo refresh e mostra a home', async () => {
    stubApi({
      '/api/auth/refresh': () => json(200, { user, accessToken: 't' }),
      '/api/health': () => json(200, { status: 'ok', timestamp: '2026-10-01T12:00:00.000Z' }),
    });
    renderAt('/');
    expect(await screen.findByRole('heading', { name: /Olá, Ana/ })).toBeInTheDocument();
  });

  it('faz login e vai para a home', async () => {
    stubApi({
      '/api/auth/refresh': () => json(401),
      '/api/auth/login': () => json(200, { user, accessToken: 't' }),
      '/api/health': () => json(200, { status: 'ok', timestamp: '2026-10-01T12:00:00.000Z' }),
    });
    renderAt('/login');

    await userEvent.type(await screen.findByLabelText('E-mail'), 'ana@mail.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-123');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { name: /Olá, Ana/ })).toBeInTheDocument();
  });

  it('mostra a mensagem do servidor quando as credenciais são inválidas', async () => {
    stubApi({
      '/api/auth/refresh': () => json(401),
      '/api/auth/login': () => json(401, { message: 'Credenciais inválidas' }),
    });
    renderAt('/login');

    await userEvent.type(await screen.findByLabelText('E-mail'), 'ana@mail.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'errada');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciais inválidas');
  });

  it('valida o cadastro no cliente antes de chamar a API', async () => {
    const fetchMock = stubApi({ '/api/auth/refresh': () => json(401) });
    renderAt('/register');

    await userEvent.type(await screen.findByLabelText('Senha'), '123');
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByText('A senha deve ter ao menos 8 caracteres')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/auth/register')).toBe(false);
  });
});
