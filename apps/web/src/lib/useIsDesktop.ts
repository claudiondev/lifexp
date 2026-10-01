import { useSyncExternalStore } from 'react';

/** Mesmo ponto de corte do `md` do Tailwind. */
const DESKTOP_QUERY = '(min-width: 768px)';

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
  const media = window.matchMedia(DESKTOP_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  // Sem matchMedia (ex.: testes), assume tela grande.
  return typeof window === 'undefined' || !window.matchMedia
    ? true
    : window.matchMedia(DESKTOP_QUERY).matches;
}

/**
 * Tela grande ou pequena. Usado para RENDERIZAR uma visão ou outra (grade da semana no desktop,
 * dia a dia no celular), em vez de esconder uma delas com CSS: assim não existem duas cópias dos
 * blocos na página, nem para leitores de tela.
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
