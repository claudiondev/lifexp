import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdateBanner, UpdatePrompt } from './UpdatePrompt';

const sw = vi.hoisted(() => ({
  needRefresh: false,
  setNeedRefresh: vi.fn(),
  updateServiceWorker: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [sw.needRefresh, sw.setNeedRefresh],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: sw.updateServiceWorker,
  }),
}));

describe('UpdatePrompt', () => {
  beforeEach(() => {
    sw.needRefresh = false;
    sw.setNeedRefresh.mockClear();
    sw.updateServiceWorker.mockClear();
  });

  it('não mostra nada quando não há versão nova', () => {
    render(<UpdatePrompt />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('avisa quando há versão nova e atualiza só quando a pessoa aceita', async () => {
    sw.needRefresh = true;
    render(<UpdatePrompt />);

    expect(screen.getByRole('status')).toHaveTextContent('Nova versão disponível.');
    expect(sw.updateServiceWorker).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Atualizar' }));

    expect(sw.updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('"Depois" dispensa o aviso sem atualizar', async () => {
    sw.needRefresh = true;
    render(<UpdatePrompt />);

    await userEvent.click(screen.getByRole('button', { name: 'Depois' }));

    expect(sw.setNeedRefresh).toHaveBeenCalledWith(false);
    expect(sw.updateServiceWorker).not.toHaveBeenCalled();
  });
});

describe('UpdateBanner', () => {
  it('chama cada ação no seu botão', async () => {
    const onUpdate = vi.fn();
    const onDismiss = vi.fn();
    render(<UpdateBanner onUpdate={onUpdate} onDismiss={onDismiss} />);

    await userEvent.click(screen.getByRole('button', { name: 'Depois' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
