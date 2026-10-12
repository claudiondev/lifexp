import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { completionAffectedKeys } from '../today/useCompletionMutations';
import { PushActionSync } from './PushActionSync';

/** `navigator.serviceWorker` de mentira: só o suficiente para registrar e disparar o evento `message`. */
function stubServiceWorker() {
  const listeners = new Map<string, (event: MessageEvent) => void>();
  vi.stubGlobal('navigator', {
    serviceWorker: {
      addEventListener: (type: string, listener: (event: MessageEvent) => void) =>
        listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
    },
  });
  return {
    send: (data: unknown) => listeners.get('message')?.({ data } as MessageEvent),
  };
}

describe('PushActionSync', () => {
  // A limpeza automática do testing-library (desmontar) precisa rodar ANTES de tirar o
  // `navigator` falso, senão o efeito de limpeza do componente acha `serviceWorker` indefinido.
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('não renderiza nada', () => {
    stubServiceWorker();
    const client = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={client}>
        <PushActionSync />
      </QueryClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('mensagem "lifexp-checkin" do service worker invalida tudo que concluir/desfazer invalida', () => {
    const sw = stubServiceWorker();
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    render(
      <QueryClientProvider client={client}>
        <PushActionSync />
      </QueryClientProvider>,
    );

    sw.send({ type: 'lifexp-checkin' });

    expect(spy).toHaveBeenCalledTimes(completionAffectedKeys.length);
    for (const queryKey of completionAffectedKeys) {
      expect(spy).toHaveBeenCalledWith({ queryKey });
    }
  });

  it('ignora mensagens de outro tipo ou sem o formato esperado', () => {
    const sw = stubServiceWorker();
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    render(
      <QueryClientProvider client={client}>
        <PushActionSync />
      </QueryClientProvider>,
    );

    sw.send({ type: 'outra-coisa' });
    sw.send(undefined);
    sw.send(null);

    expect(spy).not.toHaveBeenCalled();
  });

  it('sem suporte a service worker, não quebra (só não ouve nada)', () => {
    vi.stubGlobal('navigator', {});
    const client = new QueryClient();
    expect(() =>
      render(
        <QueryClientProvider client={client}>
          <PushActionSync />
        </QueryClientProvider>,
      ),
    ).not.toThrow();
  });

  it('remove o ouvinte ao desmontar', () => {
    const sw = stubServiceWorker();
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { unmount } = render(
      <QueryClientProvider client={client}>
        <PushActionSync />
      </QueryClientProvider>,
    );

    unmount();
    sw.send({ type: 'lifexp-checkin' });

    expect(spy).not.toHaveBeenCalled();
  });
});
