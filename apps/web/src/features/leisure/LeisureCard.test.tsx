import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LeisureCard } from './LeisureCard';
import { NOW, OPTION_SERIES, makeOption, renderWithProviders, setupFakeLeisure } from './testing';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast, Toaster: () => null }));

const card = () => screen.findByRole('region', { name: 'Tempo de lazer' });
const at = (offsetSec: number) => new Date(new Date(NOW).getTime() + offsetSec * 1000);

describe('LeisureCard (tempo de lazer na tela Hoje)', () => {
  beforeEach(() => {
    toast.success.mockClear();
    toast.error.mockClear();
    // Só o relógio é falso: os temporizadores reais seguem andando (a contagem regressiva usa setInterval).
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(NOW));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('mostra o saldo e um botão por lazer quando há tempo ganho', async () => {
    setupFakeLeisure({
      earnedMin: 90,
      options: [makeOption(), makeOption({ id: OPTION_SERIES, name: 'Série', icon: 'tv' })],
    });
    renderWithProviders(<LeisureCard />);

    const region = await card();
    expect(within(region).getByText('1h30')).toBeInTheDocument();
    expect(within(region).getByText('Você conquistou este tempo. Aproveite!')).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: 'Instagram' })).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: 'Série' })).toBeInTheDocument();
  });

  it('liga aos detalhes; com saldo e sem lazer cadastrado, convida a cadastrar', async () => {
    setupFakeLeisure({ earnedMin: 45, options: [] });
    renderWithProviders(<LeisureCard />);

    const region = await card();
    expect(within(region).getByRole('link', { name: 'Ver detalhes' })).toHaveAttribute(
      'href',
      '/lazer',
    );
    expect(within(region).getByRole('link', { name: 'Cadastre um lazer' })).toHaveAttribute(
      'href',
      '/lazer',
    );
    expect(within(region).queryByRole('button')).toBeNull();
  });

  it('na própria página de lazer (showLinks desligado) não aponta para si mesma', async () => {
    setupFakeLeisure({ earnedMin: 45, options: [] });
    renderWithProviders(<LeisureCard showLinks={false} />);

    const region = await card();
    expect(within(region).queryByRole('link')).toBeNull();
  });

  it('sem saldo, mostra como ganhar (tom positivo) e nenhum botão de usar', async () => {
    setupFakeLeisure({ earnedMin: 0 });
    renderWithProviders(<LeisureCard />);

    const region = await card();
    expect(
      within(region).getByText('Cumpra blocos das atividades que geram lazer para ganhar tempo.'),
    ).toBeInTheDocument();
    expect(within(region).queryByRole('button')).toBeNull();
    expect(region.textContent).not.toMatch(/acab|esgot|perdi|falt[ao]u/i);
  });

  it('não aparece sem lazer cadastrado e sem saldo', async () => {
    const { calls } = setupFakeLeisure({ earnedMin: 0, options: [] });
    renderWithProviders(<LeisureCard />);

    await waitFor(() => expect(calls.some((call) => call.url === '/api/leisure')).toBe(true));
    await waitFor(() =>
      expect(calls.some((call) => call.url.startsWith('/api/leisure/options'))).toBe(true),
    );
    expect(screen.queryByRole('region', { name: 'Tempo de lazer' })).toBeNull();
  });

  it('é um extra: se a consulta do saldo falha, o cartão some sem alarme', async () => {
    const { calls } = setupFakeLeisure({ earnedMin: 60, summaryStatus: 500 });
    renderWithProviders(<LeisureCard />);

    await waitFor(() => expect(calls.some((call) => call.url === '/api/leisure')).toBe(true));
    expect(screen.queryByRole('region', { name: 'Tempo de lazer' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('iniciar abre o cronômetro com o saldo todo e esconde os botões de usar', async () => {
    const { calls } = setupFakeLeisure({ earnedMin: 60 });
    renderWithProviders(<LeisureCard />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Instagram' }));

    const region = await card();
    expect(await within(region).findByRole('timer')).toHaveTextContent('1:00:00');
    expect(within(region).getByText('Instagram em andamento')).toBeInTheDocument();
    expect(within(region).queryByRole('button', { name: 'Instagram' })).toBeNull();
    expect(within(region).getByRole('button', { name: 'Parar' })).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      optionId: expect.any(String),
    });
  });

  it('a contagem regressiva anda com o relógio', async () => {
    setupFakeLeisure({ earnedMin: 30 });
    renderWithProviders(<LeisureCard />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Instagram' }));
    const timer = await screen.findByRole('timer');
    expect(timer).toHaveTextContent('30:00');

    vi.setSystemTime(at(90));
    await waitFor(() => expect(timer).toHaveTextContent('28:30'));
  });

  it('parar desconta o tempo usado, avisa em tom positivo e volta aos botões', async () => {
    setupFakeLeisure({ earnedMin: 60 });
    renderWithProviders(<LeisureCard />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Instagram' }));
    await screen.findByRole('timer');
    vi.setSystemTime(at(20 * 60));
    await user.click(screen.getByRole('button', { name: 'Parar' }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Instagram: 20 min aproveitados'),
    );
    const region = await card();
    expect(await within(region).findByText('40 min')).toBeInTheDocument();
    expect(within(region).queryByRole('timer')).toBeNull();
    expect(within(region).getByRole('button', { name: 'Instagram' })).toBeInTheDocument();
  });

  it('quando o tempo acaba sozinho, o cronômetro some e o saldo zera', async () => {
    setupFakeLeisure({ earnedMin: 10 });
    renderWithProviders(<LeisureCard />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Instagram' }));
    await screen.findByRole('timer');
    vi.setSystemTime(at(11 * 60));

    await waitFor(() => expect(screen.queryByRole('timer')).toBeNull());
    const region = await card();
    expect(await within(region).findByText('0 min')).toBeInTheDocument();
  });

  it('recusa do servidor vira aviso de erro e o cartão continua utilizável', async () => {
    setupFakeLeisure({
      earnedMin: 30,
      fail: {
        'POST /api/leisure/sessions': {
          status: 409,
          message: 'Já existe um cronômetro de lazer em andamento',
        },
      },
    });
    renderWithProviders(<LeisureCard />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Instagram' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Já existe um cronômetro de lazer em andamento'),
    );
    expect(screen.getByRole('button', { name: 'Instagram' })).toBeEnabled();
  });

  it('lazer arquivado não vira botão, mas o nome ainda aparece na sessão em andamento', async () => {
    setupFakeLeisure({
      earnedMin: 30,
      options: [
        makeOption({ archivedAt: '2026-10-06T12:00:00.000Z' }),
        makeOption({ id: OPTION_SERIES, name: 'Série', icon: 'tv' }),
      ],
    });
    renderWithProviders(<LeisureCard />);

    const region = await card();
    expect(within(region).queryByRole('button', { name: 'Instagram' })).toBeNull();
    expect(within(region).getByRole('button', { name: 'Série' })).toBeInTheDocument();
  });
});
