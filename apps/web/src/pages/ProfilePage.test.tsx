import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { setAccessToken } from '@/lib/apiClient';
import { ProfilePage } from './ProfilePage';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast, Toaster: () => null }));

const baseUser = {
  id: '0192f1a0-7b3c-7000-8000-000000000001',
  name: 'Ana',
  email: 'ana@mail.com',
  timezone: 'America/Sao_Paulo',
  avatarKey: 'swords',
  createdAt: '2026-10-01T12:00:00.000Z',
};

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup(patch?: (body: Record<string, unknown>) => Response) {
  let user = { ...baseUser };
  const patches: Record<string, unknown>[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === '/api/auth/refresh') return json(200, { user, accessToken: 't' });
      if (url === '/api/users/me' && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body));
        patches.push(body);
        if (patch) return patch(body);
        user = { ...user, ...body };
        return json(200, user);
      }
      return json(404);
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ProfilePage />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { patches };
}

const saveButton = () => screen.getByRole('button', { name: 'Salvar alterações' });

describe('ProfilePage', () => {
  beforeEach(() => {
    setAccessToken(null);
    toast.success.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('mostra os dados atuais, com o e-mail somente leitura', async () => {
    setup();
    expect(await screen.findByLabelText('Nome')).toHaveValue('Ana');
    expect(screen.getByLabelText('E-mail')).toHaveValue('ana@mail.com');
    expect(screen.getByLabelText('E-mail')).toBeDisabled();
    expect(screen.getByLabelText('Fuso horário')).toHaveValue('America/Sao_Paulo');
    expect(screen.getByRole('radio', { name: 'Espadas' })).toBeChecked();
  });

  it('só habilita salvar depois de uma alteração', async () => {
    setup();
    const name = await screen.findByLabelText('Nome');
    expect(saveButton()).toBeDisabled();

    await userEvent.type(name, 'x');
    expect(saveButton()).toBeEnabled();

    await userEvent.type(name, '{backspace}');
    expect(saveButton()).toBeDisabled();
  });

  it('envia só o campo alterado (nome) e confirma com um aviso', async () => {
    const { patches } = setup();
    const name = await screen.findByLabelText('Nome');

    await userEvent.clear(name);
    await userEvent.type(name, 'Maria');
    await userEvent.click(saveButton());

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Perfil atualizado'));
    expect(patches).toEqual([{ name: 'Maria' }]);
    await waitFor(() => expect(saveButton()).toBeDisabled());
  });

  it('troca o emblema e envia apenas avatarKey', async () => {
    const { patches } = setup();
    await screen.findByLabelText('Nome');

    await userEvent.click(screen.getByRole('radio', { name: 'Coroa' }));
    await userEvent.click(saveButton());

    await waitFor(() => expect(patches).toEqual([{ avatarKey: 'crown' }]));
  });

  it('troca o fuso horário e envia apenas timezone', async () => {
    const { patches } = setup();
    await screen.findByLabelText('Nome');

    await userEvent.selectOptions(screen.getByLabelText('Fuso horário'), 'America/Manaus');
    await userEvent.click(saveButton());

    await waitFor(() => expect(patches).toEqual([{ timezone: 'America/Manaus' }]));
  });

  it('atualiza a prévia da ficha enquanto a pessoa digita, antes de salvar', async () => {
    const { patches } = setup();
    const name = await screen.findByLabelText('Nome');

    await userEvent.clear(name);
    await userEvent.type(name, 'Capitã');

    const card = screen.getByRole('region', { name: 'Ficha do personagem' });
    expect(within(card).getByText('Capitã')).toBeInTheDocument();
    expect(patches).toHaveLength(0);
  });

  it('valida nome vazio sem chamar a API', async () => {
    const { patches } = setup();
    const name = await screen.findByLabelText('Nome');

    await userEvent.clear(name);
    await userEvent.click(saveButton());

    expect(await screen.findByText('Informe o nome')).toBeInTheDocument();
    expect(patches).toHaveLength(0);
  });

  it('mostra o erro do servidor e mantém as alterações no formulário', async () => {
    setup(() => json(400, { message: 'Validation failed' }));
    const name = await screen.findByLabelText('Nome');

    await userEvent.clear(name);
    await userEvent.type(name, 'Maria');
    await userEvent.click(saveButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Validation failed');
    expect(name).toHaveValue('Maria');
    expect(toast.success).not.toHaveBeenCalled();
  });
});
