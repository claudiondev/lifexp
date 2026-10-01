import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIsDesktop } from './useIsDesktop';

/** matchMedia falso cujo resultado a gente controla e pode "disparar" como o navegador faz. */
function stubMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  const media = {
    get matches() {
      return matches;
    },
    addEventListener: vi.fn((_: string, listener: () => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_: string, listener: () => void) => listeners.delete(listener)),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => media),
  );
  return {
    media,
    listeners,
    resize(next: boolean) {
      matches = next;
      listeners.forEach((listener) => listener());
    },
  };
}

describe('useIsDesktop', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('assume tela grande quando o navegador não tem matchMedia', () => {
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(true);
  });

  it('reflete o estado inicial da media query', () => {
    stubMatchMedia(false);
    expect(renderHook(() => useIsDesktop()).result.current).toBe(false);
    stubMatchMedia(true);
    expect(renderHook(() => useIsDesktop()).result.current).toBe(true);
  });

  it('usa o mesmo ponto de corte do md do Tailwind (768px)', () => {
    stubMatchMedia(true);
    renderHook(() => useIsDesktop());
    expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 768px)');
  });

  it('atualiza quando a janela muda de tamanho', () => {
    const screen = stubMatchMedia(true);
    const { result } = renderHook(() => useIsDesktop());

    act(() => screen.resize(false));
    expect(result.current).toBe(false);
    act(() => screen.resize(true));
    expect(result.current).toBe(true);
  });

  it('deixa de escutar ao desmontar', () => {
    const screen = stubMatchMedia(true);
    const { unmount } = renderHook(() => useIsDesktop());
    expect(screen.listeners.size).toBe(1);

    unmount();

    expect(screen.listeners.size).toBe(0);
    expect(screen.media.removeEventListener).toHaveBeenCalled();
  });
});
