import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from './lib/apiClient';
import { createQueryClient } from './lib/queryClient';
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
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
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

  it('navega entre Painel, Áreas e Ajustes pelo menu', async () => {
    stubApi({
      '/api/auth/refresh': () => json(200, { user, accessToken: 't' }),
      '/api/health': () => json(200, { status: 'ok', timestamp: '2026-10-01T12:00:00.000Z' }),
    });
    renderAt('/');
    await screen.findByRole('heading', { name: /Olá, Ana/ });

    // Áreas e Ajustes ficam só na barra lateral; na barra do celular entram em "Mais" (fechado, fora da tela).
    expect(screen.getAllByRole('link', { name: 'Áreas' })).toHaveLength(1);
    await userEvent.click(screen.getByRole('link', { name: 'Áreas' }));
    expect(await screen.findByRole('heading', { name: 'Áreas da vida' })).toBeInTheDocument();

    // o menu aponta direto para o endereço novo (senão a aba ativa nunca ficaria destacada)
    for (const link of screen.getAllByRole('link', { name: 'Ajustes' })) {
      expect(link).toHaveAttribute('href', '/configuracoes');
    }
    await userEvent.click(screen.getByRole('link', { name: 'Ajustes' }));
    expect(
      await screen.findByRole('heading', { name: 'Configurações' }, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it('o painel tem atalhos para Conquistas e Recompensas e mostra o título do personagem', async () => {
    stubApi({
      '/api/auth/refresh': () => json(200, { user, accessToken: 't' }),
      '/api/health': () => json(200, { status: 'ok', timestamp: '2026-10-01T12:00:00.000Z' }),
    });
    renderAt('/');
    await screen.findByRole('heading', { name: /Olá, Ana/ });

    // o atalho do painel e o item da barra lateral levam ao mesmo lugar
    for (const link of screen.getAllByRole('link', { name: 'Conquistas' })) {
      expect(link).toHaveAttribute('href', '/conquistas');
    }
    for (const link of screen.getAllByRole('link', { name: 'Recompensas' })) {
      expect(link).toHaveAttribute('href', '/recompensas');
    }
    // nível 1 (ponto de partida) é "Aprendiz"
    expect(screen.getByText('Aprendiz')).toBeInTheDocument();
  });

  it('abre as telas de Conquistas e de Recompensas', async () => {
    stubApi({
      '/api/auth/refresh': () => json(200, { user, accessToken: 't' }),
      '/api/achievements': () => json(200, []),
      '/api/rewards': () => json(200, []),
    });
    const first = renderAt('/conquistas');
    expect(await screen.findByRole('heading', { name: 'Conquistas' })).toBeInTheDocument();
    first.unmount();
    renderAt('/recompensas');
    expect(await screen.findByRole('heading', { name: 'Recompensas' })).toBeInTheDocument();
  });

  it('a barra lateral lista as telas por grupo e marca só a atual', async () => {
    stubApi({
      '/api/auth/refresh': () => json(200, { user, accessToken: 't' }),
      '/api/health': () => json(200, { status: 'ok', timestamp: '2026-10-01T12:00:00.000Z' }),
    });
    renderAt('/');
    await screen.findByRole('heading', { name: /Olá, Ana/ });

    const nav = screen.getByRole('navigation', { name: 'Principal' });
    for (const name of ['Painel', 'Hoje', 'Semana', 'Mês', 'Metas', 'Notas', 'Áreas', 'Ajustes']) {
      expect(within(nav).getByRole('link', { name })).toBeInTheDocument();
    }
    expect(within(nav).getByRole('link', { name: 'Painel' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Hoje' })).not.toHaveAttribute('aria-current');
  });

  it('o botão "Mais" da barra do celular abre as telas que não cabem nela', async () => {
    stubApi({
      '/api/auth/refresh': () => json(200, { user, accessToken: 't' }),
      '/api/health': () => json(200, { status: 'ok', timestamp: '2026-10-01T12:00:00.000Z' }),
    });
    renderAt('/');
    await screen.findByRole('heading', { name: /Olá, Ana/ });

    await userEvent.click(screen.getByRole('button', { name: 'Mais' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mais telas' });
    expect(within(dialog).getByRole('link', { name: 'Mês' })).toHaveAttribute(
      'href',
      '/calendario',
    );
    expect(within(dialog).getByRole('link', { name: 'Revisão' })).toHaveAttribute(
      'href',
      '/revisao',
    );
  });

  it('o menu tem "Notas" na barra lateral e na barra do celular, apontando para /notas', async () => {
    stubApi({
      '/api/auth/refresh': () => json(200, { user, accessToken: 't' }),
      '/api/health': () => json(200, { status: 'ok', timestamp: '2026-10-01T12:00:00.000Z' }),
    });
    renderAt('/');
    await screen.findByRole('heading', { name: /Olá, Ana/ });
    const links = screen.getAllByRole('link', { name: 'Notas' });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toHaveAttribute('href', '/notas');
  });

  it('o endereço antigo /perfil leva às Configurações', async () => {
    stubApi({
      '/api/auth/refresh': () => json(200, { user, accessToken: 't' }),
    });
    renderAt('/perfil');
    // sob carga (suíte inteira em paralelo) a tela demora mais que 1 s para montar
    expect(
      await screen.findByRole('heading', { name: 'Configurações' }, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it('manda visitante que abre /areas direto para o login e volta depois', async () => {
    stubApi({ '/api/auth/refresh': () => json(401) });
    renderAt('/areas');
    expect(
      await screen.findByRole('heading', { name: 'Continue sua jornada' }),
    ).toBeInTheDocument();
  });
});
