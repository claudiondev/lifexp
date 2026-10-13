import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NOW,
  OPTION_SERIES,
  makeOption,
  renderWithProviders,
  setupFakeLeisure,
} from '@/features/leisure/testing';
import { LeisurePage } from './LeisurePage';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast, Toaster: () => null }));

const ACTIVITY = '0192f1a0-7b3c-7000-8000-0000000000a1';
const render = () => renderWithProviders(<LeisurePage />, '/lazer');
const section = (name: string) => screen.findByRole('region', { name });

describe('LeisurePage (tempo de lazer)', () => {
  beforeEach(() => {
    toast.success.mockClear();
    toast.error.mockClear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(NOW));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('mostra o saldo da semana: ganho, usado e disponível', async () => {
    setupFakeLeisure({ earnedMin: 90 });
    render();

    expect(
      await screen.findByRole('heading', { name: 'Tempo de lazer', level: 1 }),
    ).toBeInTheDocument();
    const tiles = (await screen.findByText('Disponível')).closest('dl')!;
    expect(within(tiles).getByText('Ganho').nextElementSibling).toHaveTextContent('1h30');
    expect(within(tiles).getByText('Usado').nextElementSibling).toHaveTextContent('0 min');
    expect(within(tiles).getByText('Disponível').nextElementSibling).toHaveTextContent('1h30');
  });

  it('lista o ganho por atividade', async () => {
    setupFakeLeisure({
      earnedMin: 90,
      byActivity: [{ activityId: ACTIVITY, name: 'Estudo da Bíblia', doneMin: 180, earnedMin: 90 }],
    });
    render();

    const region = await section('Ganho por atividade');
    expect(within(region).getByText('Estudo da Bíblia')).toBeInTheDocument();
    expect(within(region).getByText('3h cumpridas')).toBeInTheDocument();
    expect(within(region).getByText('+1h30')).toBeInTheDocument();
  });

  it('sem ganho, explica como ganhar e leva às Áreas', async () => {
    setupFakeLeisure({ earnedMin: 0 });
    render();

    const region = await section('Ganho por atividade');
    expect(within(region).getByRole('link', { name: 'Áreas' })).toHaveAttribute('href', '/areas');
    expect(region.textContent).not.toMatch(/atras|perdi|falt[ao]u/i);
  });

  it('as sessões da semana vêm da mais recente para a mais antiga, no fuso da pessoa', async () => {
    // 15:00Z é 00:00 de quinta em Tóquio (UTC+9): nem o horário UTC nem o da máquina servem.
    setupFakeLeisure({ earnedMin: 60, timezone: 'Asia/Tokyo' });
    render();
    const user = userEvent.setup();
    const minutesAfter = (minutes: number) =>
      vi.setSystemTime(new Date(new Date(NOW).getTime() + minutes * 60_000));

    await user.click(await screen.findByRole('button', { name: 'Instagram' }));
    await screen.findByRole('timer');
    minutesAfter(10);
    await user.click(screen.getByRole('button', { name: 'Parar' }));
    await screen.findByRole('button', { name: 'Instagram' });
    minutesAfter(30);
    await user.click(screen.getByRole('button', { name: 'Instagram' }));
    await screen.findByRole('timer');
    minutesAfter(45);
    await user.click(screen.getByRole('button', { name: 'Parar' }));

    const region = await section('Sessões da semana');
    await waitFor(() => expect(within(region).getAllByRole('listitem')).toHaveLength(2));
    const [latest, oldest] = within(region).getAllByRole('listitem');
    expect(latest).toHaveTextContent(/qui\.?,? 00:30/);
    expect(latest).toHaveTextContent('15 min');
    expect(oldest).toHaveTextContent(/qui\.?,? 00:00/);
    expect(oldest).toHaveTextContent('10 min');
    expect(within(latest!).getByText('Instagram')).toBeInTheDocument();
  });

  it('cadastra um lazer novo escolhendo o ícone', async () => {
    const { calls } = setupFakeLeisure({ earnedMin: 0, options: [] });
    render();
    const user = userEvent.setup();

    const manager = await section('Seus lazeres');
    expect(within(manager).getByText(/Nenhum lazer cadastrado/)).toBeInTheDocument();
    await user.click(within(manager).getByRole('button', { name: 'Novo lazer' }));
    await user.type(await screen.findByLabelText('Nome'), 'Série');
    await user.click(screen.getByRole('radio', { name: 'TV' }));
    await user.click(screen.getByRole('button', { name: 'Cadastrar lazer' }));

    expect(await within(manager).findByText('Série')).toBeInTheDocument();
    expect(
      calls.find((c) => c.method === 'POST' && c.url === '/api/leisure/options')?.body,
    ).toEqual({
      name: 'Série',
      icon: 'tv',
    });
    expect(toast.success).toHaveBeenCalledWith('Lazer “Série” cadastrado');
  });

  it('valida o nome vazio sem chamar a API', async () => {
    const { calls } = setupFakeLeisure({ options: [] });
    render();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Novo lazer' }));
    await user.click(await screen.findByRole('button', { name: 'Cadastrar lazer' }));

    expect(await screen.findByText('Informe o nome do lazer')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST' && c.url === '/api/leisure/options')).toBe(false);
  });

  it('nome repetido: mostra o erro do servidor e mantém o diálogo aberto', async () => {
    setupFakeLeisure({ options: [makeOption()] });
    render();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Novo lazer' }));
    await user.type(await screen.findByLabelText('Nome'), 'instagram');
    await user.click(screen.getByRole('button', { name: 'Cadastrar lazer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Você já tem um lazer ativo com esse nome',
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('renomeia e troca o ícone de um lazer', async () => {
    const { calls } = setupFakeLeisure({ options: [makeOption()] });
    render();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Editar lazer Instagram' }));
    const name = await screen.findByLabelText('Nome');
    expect(name).toHaveValue('Instagram');
    expect(screen.getByRole('radio', { name: 'Celular' })).toBeChecked();
    await user.clear(name);
    await user.type(name, 'Redes sociais');
    await user.click(screen.getByRole('radio', { name: 'Música' }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    const manager = await section('Seus lazeres');
    expect(await within(manager).findByText('Redes sociais')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      name: 'Redes sociais',
      icon: 'music',
    });
  });

  it('arquiva e restaura um lazer (nunca exclui)', async () => {
    const { calls } = setupFakeLeisure({
      options: [makeOption(), makeOption({ id: OPTION_SERIES, name: 'Série', icon: 'tv' })],
    });
    render();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Arquivar lazer Série' }));

    const manager = await section('Seus lazeres');
    expect(await within(manager).findByText('Arquivados')).toBeInTheDocument();
    expect(within(manager).queryByRole('button', { name: 'Editar lazer Série' })).toBeNull();
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ archived: true });
    expect(toast.success).toHaveBeenCalledWith('Lazer “Série” arquivado');

    await user.click(within(manager).getByRole('button', { name: 'Restaurar lazer Série' }));
    expect(
      await within(manager).findByRole('button', { name: 'Editar lazer Série' }),
    ).toBeInTheDocument();
    expect(within(manager).queryByText('Arquivados')).toBeNull();
    expect(calls.filter((c) => c.method === 'PATCH').at(-1)?.body).toEqual({ archived: false });
  });

  it('mostra o erro e permite tentar de novo quando o saldo não carrega', async () => {
    setupFakeLeisure({ summaryStatus: 500 });
    render();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar o seu tempo de lazer.',
    );
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
    // o cadastro de lazeres segue utilizável
    await waitFor(() => expect(screen.getByRole('button', { name: 'Novo lazer' })).toBeEnabled());
  });
});
