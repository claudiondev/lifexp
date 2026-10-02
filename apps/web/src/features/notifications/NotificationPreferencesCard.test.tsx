import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationPreferencesDto } from '@lifexp/shared';
import { setAccessToken } from '@/lib/apiClient';
import { NotificationPreferencesCard } from './NotificationPreferencesCard';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast, Toaster: () => null }));

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const DEFAULTS: NotificationPreferencesDto = {
  blockRemindersEnabled: true,
  blockLeadMin: 15,
  eventRemindersEnabled: true,
  digestEnabled: true,
  digestTime: '07:00',
  digestEmailEnabled: false,
  weeklyReportEnabled: true,
  pushEnabled: false,
};

function setup(
  initial: Partial<NotificationPreferencesDto> = {},
  options: { getStatus?: number; putStatus?: number } = {},
) {
  let current = { ...DEFAULTS, ...initial };
  const puts: Record<string, unknown>[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url !== '/api/notification-preferences') return json(404);
      if (init?.method === 'PUT') {
        const body = JSON.parse(String(init.body));
        puts.push(body);
        if (options.putStatus) return json(options.putStatus, { message: 'Algo deu errado' });
        current = { ...current, ...body };
        return json(200, current);
      }
      return options.getStatus
        ? json(options.getStatus, { message: 'falhou' })
        : json(200, current);
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NotificationPreferencesCard />
    </QueryClientProvider>,
  );
  return { puts };
}

const sw = (name: string) => screen.findByRole('switch', { name });

describe('NotificationPreferencesCard (RF40)', () => {
  beforeEach(() => {
    setAccessToken('token');
    toast.success.mockClear();
    toast.error.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('mostra os padrões: blocos e eventos ligados, 15 min, resumo às 07:00, e-mail desligado', async () => {
    setup();

    expect(await sw('Lembrar dos blocos')).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Lembrar dos eventos' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Resumo do dia' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Resumo por e-mail' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Relatório da semana' })).toBeChecked();
    expect(screen.getByLabelText('Quanto antes')).toHaveValue('15');
    expect(screen.getByLabelText('Hora do resumo')).toHaveValue('07:00');
  });

  it('cada interruptor salva na hora só o seu campo', async () => {
    const { puts } = setup();

    await userEvent.click(await sw('Lembrar dos eventos'));
    await waitFor(() => expect(puts).toEqual([{ eventRemindersEnabled: false }]));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Preferências salvas'));
    expect(await sw('Lembrar dos eventos')).not.toBeChecked();

    await userEvent.click(screen.getByRole('switch', { name: 'Resumo por e-mail' }));
    await waitFor(() => expect(puts.at(-1)).toEqual({ digestEmailEnabled: true }));

    await userEvent.click(screen.getByRole('switch', { name: 'Relatório da semana' }));
    await waitFor(() => expect(puts.at(-1)).toEqual({ weeklyReportEnabled: false }));
  });

  it('troca a antecedência do lembrete de bloco', async () => {
    const { puts } = setup();
    await sw('Lembrar dos blocos');

    await userEvent.selectOptions(screen.getByLabelText('Quanto antes'), '1 hora antes');

    await waitFor(() => expect(puts).toEqual([{ blockLeadMin: 60 }]));
    expect(screen.getByLabelText('Quanto antes')).toHaveValue('60');
  });

  it('oferece as cinco antecedências de bloco', async () => {
    setup();
    await sw('Lembrar dos blocos');
    const labels = Array.from(screen.getByLabelText('Quanto antes').querySelectorAll('option')).map(
      (option) => option.textContent,
    );
    expect(labels).toEqual([
      '5 minutos antes',
      '10 minutos antes',
      '15 minutos antes',
      '30 minutos antes',
      '1 hora antes',
    ]);
  });

  it('com lembrete de bloco desligado, a antecedência fica desabilitada', async () => {
    setup({ blockRemindersEnabled: false });
    await sw('Lembrar dos blocos');
    expect(screen.getByLabelText('Quanto antes')).toBeDisabled();
  });

  it('salva a hora do resumo ao sair do campo, e só se mudou', async () => {
    const { puts } = setup();
    const input = await screen.findByLabelText('Hora do resumo');

    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(puts).toEqual([]); // não mudou: nada a salvar

    fireEvent.change(input, { target: { value: '06:30' } });
    expect(puts).toEqual([]); // ainda digitando
    fireEvent.blur(input);
    await waitFor(() => expect(puts).toEqual([{ digestTime: '06:30' }]));
  });

  it('hora vazia volta ao valor salvo e não chama a API', async () => {
    const { puts } = setup();
    const input = await screen.findByLabelText('Hora do resumo');

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    expect(puts).toEqual([]);
    expect(input).toHaveValue('07:00');
  });

  it('com o resumo do dia desligado, hora e e-mail ficam desabilitados e o e-mail explica', async () => {
    setup({ digestEnabled: false });

    expect(await screen.findByLabelText('Hora do resumo')).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Resumo por e-mail' })).toBeDisabled();
    expect(
      screen.getByText('Ligue o resumo do dia para poder receber por e-mail.'),
    ).toBeInTheDocument();
  });

  it('desligar o resumo do dia envia só digestEnabled', async () => {
    const { puts } = setup();

    await userEvent.click(await sw('Resumo do dia'));

    await waitFor(() => expect(puts).toEqual([{ digestEnabled: false }]));
  });

  it('erro do servidor ao salvar mostra o aviso e mantém o valor salvo', async () => {
    setup({}, { putStatus: 500 });

    await userEvent.click(await sw('Lembrar dos blocos'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Algo deu errado'));
    expect(toast.success).not.toHaveBeenCalled();
    expect(await sw('Lembrar dos blocos')).toBeChecked();
  });

  it('erro ao carregar oferece tentar de novo', async () => {
    setup({}, { getStatus: 500 });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar as preferências',
    );
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});
