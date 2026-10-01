import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InstallAppCard } from './InstallAppCard';

function installEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  const prompt = vi.fn().mockResolvedValue(undefined);
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome }) });
  return { event, prompt };
}

describe('InstallAppCard', () => {
  it('não aparece enquanto o navegador não oferece a instalação', () => {
    render(<InstallAppCard />);
    expect(screen.queryByRole('button', { name: 'Instalar app' })).not.toBeInTheDocument();
  });

  it('aparece quando o navegador oferece e segura o aviso automático', () => {
    render(<InstallAppCard />);
    const { event } = installEvent();

    act(() => {
      window.dispatchEvent(event);
    });

    expect(screen.getByRole('button', { name: 'Instalar app' })).toBeInTheDocument();
    expect(event.defaultPrevented).toBe(true);
  });

  it('abre o convite do navegador ao clicar e esconde o botão depois', async () => {
    render(<InstallAppCard />);
    const { event, prompt } = installEvent('dismissed');
    act(() => {
      window.dispatchEvent(event);
    });

    await userEvent.click(screen.getByRole('button', { name: 'Instalar app' }));

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Instalar app' })).not.toBeInTheDocument();
  });

  it('some quando o app termina de ser instalado', () => {
    render(<InstallAppCard />);
    act(() => {
      window.dispatchEvent(installEvent().event);
    });
    expect(screen.getByRole('button', { name: 'Instalar app' })).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(screen.queryByRole('button', { name: 'Instalar app' })).not.toBeInTheDocument();
  });

  it('para de escutar o navegador ao desmontar', () => {
    const { unmount } = render(<InstallAppCard />);
    unmount();
    const { event } = installEvent();

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});
