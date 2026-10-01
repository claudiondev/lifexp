import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../lib/queryClient';
import { setAccessToken } from '../../lib/apiClient';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './useAuth';

const user = {
  id: '1',
  name: 'Ana',
  email: 'ana@mail.com',
  timezone: 'UTC',
  avatarKey: 'swords',
  createdAt: '2026-10-01T12:00:00.000Z',
};

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function Probe() {
  const { state, logout, login } = useAuth();
  return (
    <>
      <p>status: {state.status}</p>
      <button onClick={() => void logout()}>sair</button>
      <button onClick={() => void login({ email: 'b@mail.com', password: 'x' })}>entrar</button>
    </>
  );
}

describe('AuthProvider e o cache de consultas', () => {
  beforeEach(() => setAccessToken(null));
  afterEach(() => vi.unstubAllGlobals());

  function setup() {
    const queryClient = createQueryClient();
    queryClient.setQueryData(['areas'], [{ id: 'a1', name: 'dados da conta anterior' }]);
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input) => {
        const url = String(input);
        if (url === '/api/auth/refresh') return json(200, { user, accessToken: 't' });
        if (url === '/api/auth/logout') return new Response(null, { status: 204 });
        if (url === '/api/auth/login') return json(200, { user, accessToken: 't2' });
        return json(404);
      }),
    );
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </QueryClientProvider>,
    );
    return queryClient;
  }

  it('limpa o cache ao sair, para os dados não aparecerem para a próxima pessoa', async () => {
    const queryClient = setup();
    await screen.findByText('status: authenticated');
    expect(queryClient.getQueryData(['areas'])).toBeDefined();

    await userEvent.click(screen.getByText('sair'));

    await waitFor(() => expect(screen.getByText('status: anonymous')).toBeInTheDocument());
    expect(queryClient.getQueryData(['areas'])).toBeUndefined();
  });

  it('limpa o cache ao entrar com outra conta', async () => {
    const queryClient = setup();
    await screen.findByText('status: authenticated');

    await userEvent.click(screen.getByText('entrar'));

    await waitFor(() => expect(queryClient.getQueryData(['areas'])).toBeUndefined());
  });
});
