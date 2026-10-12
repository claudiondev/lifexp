import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SOURCE = readFileSync(join(process.cwd(), 'public', 'push-sw.js'), 'utf8');

type Listener = (event: unknown) => void;

/** Carrega o service worker com um `self` falso e devolve os tratadores que ele registrou. */
function loadWorker() {
  const listeners = new Map<string, Listener>();
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  const clientsList: { focus: () => Promise<void>; navigate: (url: string) => Promise<void> }[] =
    [];
  const self = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    registration: {
      showNotification: async (title: string, options: Record<string, unknown>) => {
        shown.push({ title, options });
      },
    },
    clients: {
      matchAll: async () => clientsList,
      openWindow: async (url: string) => {
        opened.push(url);
      },
    },
  };
  new Function('self', SOURCE)(self);
  return { listeners, shown, opened, clientsList };
}

/** Um evento `push` cujo corpo é o JSON dado (ou inválido). */
function pushEvent(body: string | null) {
  const waits: Promise<unknown>[] = [];
  return {
    event: {
      data: body === null ? null : { json: () => JSON.parse(body) },
      waitUntil: (promise: Promise<unknown>) => waits.push(promise),
    },
    done: () => Promise.all(waits),
  };
}

function clickEvent(data: unknown, options: { action?: string; tag?: string } = {}) {
  const waits: Promise<unknown>[] = [];
  const closed = vi.fn();
  return {
    event: {
      action: options.action,
      notification: { close: closed, data, tag: options.tag },
      waitUntil: (promise: Promise<unknown>) => waits.push(promise),
    },
    closed,
    done: () => Promise.all(waits),
  };
}

describe('push-sw.js', () => {
  let worker: ReturnType<typeof loadWorker>;
  beforeEach(() => {
    worker = loadWorker();
  });

  it('registra os dois tratadores', () => {
    expect([...worker.listeners.keys()].sort()).toEqual(['notificationclick', 'push']);
  });

  describe('push', () => {
    const receive = async (body: string | null) => {
      const { event, done } = pushEvent(body);
      worker.listeners.get('push')!(event);
      await done();
      return worker.shown;
    };

    it('mostra o aviso com título, texto, ícone, etiqueta e destino', async () => {
      const [shown] = await receive(
        JSON.stringify({
          title: 'Seu dia',
          body: 'Hoje: 2 blocos.',
          url: '/hoje',
          tag: 'digest:1',
        }),
      );
      expect(shown).toEqual({
        title: 'Seu dia',
        options: {
          body: 'Hoje: 2 blocos.',
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          data: { url: '/hoje' },
          tag: 'digest:1',
        },
      });
    });

    it('check-in com token leva os botões e o token (RF41); sem token, nenhum dos dois', async () => {
      const [withButtons] = await receive(
        JSON.stringify({
          title: 'Corrida terminou',
          body: 'Cumpriu?',
          tag: 'checkin:1',
          actionToken: 'token-abc',
          actions: [
            { action: 'complete', title: '✓ Cumpri' },
            { action: 'skip', title: 'Pulei' },
          ],
        }),
      );
      expect(withButtons!.options['data']).toEqual({ url: '/hoje', token: 'token-abc' });
      expect(withButtons!.options['actions']).toEqual([
        { action: 'complete', title: '✓ Cumpri' },
        { action: 'skip', title: 'Pulei' },
      ]);

      worker.shown.length = 0;
      const [noButtons] = await receive(JSON.stringify({ title: 'Seu dia', tag: 'digest:1' }));
      expect(noButtons!.options['data']).toEqual({ url: '/hoje' });
      expect('actions' in noButtons!.options).toBe(false);
    });

    it('sem título usa "LifeXP"; sem corpo, texto vazio; sem etiqueta, nenhuma', async () => {
      const [shown] = await receive(JSON.stringify({ title: '   ' }));
      expect(shown!.title).toBe('LifeXP');
      expect(shown!.options['body']).toBe('');
      expect('tag' in shown!.options).toBe(false);
    });

    it('mensagem sem corpo ou com JSON inválido ainda mostra um aviso, sem quebrar', async () => {
      expect((await receive(null))[0]!.title).toBe('LifeXP');
      expect((await receive('isso não é json'))[0]!.title).toBe('LifeXP');
    });

    it('tipos errados não viram texto estranho (título numérico, corpo em objeto)', async () => {
      const [shown] = await receive(JSON.stringify({ title: 42, body: { x: 1 }, url: 7 }));
      expect(shown).toMatchObject({
        title: 'LifeXP',
        options: { body: '', data: { url: '/hoje' } },
      });
    });

    it('só caminhos do próprio app: URL de fora, "//" e barra invertida caem em /hoje', async () => {
      for (const url of [
        'https://evil.com',
        '//evil.com',
        '/\\evil.com',
        'javascript:alert(1)',
        'hoje',
        '',
      ]) {
        worker.shown.length = 0;
        const [shown] = await receive(JSON.stringify({ title: 'x', url }));
        expect(shown!.options['data'], url).toEqual({ url: '/hoje' });
      }
      const [ok] = await receive(JSON.stringify({ title: 'x', url: '/semana?inicio=2026-10-07' }));
      expect(ok).toBeDefined();
      expect(worker.shown.at(-1)!.options['data']).toEqual({ url: '/semana?inicio=2026-10-07' });
    });
  });

  describe('notificationclick', () => {
    const click = async (data: unknown) => {
      const { event, closed, done } = clickEvent(data);
      worker.listeners.get('notificationclick')!(event);
      await done();
      return closed;
    };

    it('fecha o aviso e abre uma janela no destino quando o app não está aberto', async () => {
      const closed = await click({ url: '/revisao' });
      expect(closed).toHaveBeenCalledTimes(1);
      expect(worker.opened).toEqual(['/revisao']);
    });

    it('com o app já aberto, leva essa janela ao destino em vez de abrir outra', async () => {
      const focus = vi.fn(async () => undefined);
      const navigate = vi.fn(async () => undefined);
      worker.clientsList.push({ focus, navigate });

      await click({ url: '/calendario' });

      expect(focus).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith('/calendario');
      expect(worker.opened).toEqual([]);
    });

    it('destino ausente ou perigoso cai em /hoje', async () => {
      await click(undefined);
      await click({ url: 'https://evil.com' });
      await click({ url: '//evil.com' });
      expect(worker.opened).toEqual(['/hoje', '/hoje', '/hoje']);
    });
  });

  describe('notificationclick: botões "Cumpri"/"Pulei" (RF41)', () => {
    afterEach(() => vi.unstubAllGlobals());

    const click = async (action: string, data: unknown, tag = 'checkin:1') => {
      const { event, closed, done } = clickEvent(data, { action, tag });
      worker.listeners.get('notificationclick')!(event);
      await done();
      return closed;
    };

    it('manda o token e a ação para a API, e mostra a confirmação que ela devolver', async () => {
      const fetchMock = vi.fn(async () => ({
        ok: true,
        json: async () => ({ title: '✓ Corrida', body: '+30 XP' }),
      }));
      vi.stubGlobal('fetch', fetchMock);

      const closed = await click('complete', { token: 'token-abc', url: '/hoje' });

      expect(closed).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith('/api/push-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'token-abc', action: 'complete' }),
      });
      expect(worker.shown.at(-1)).toEqual({
        title: '✓ Corrida',
        options: {
          body: '+30 XP',
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          tag: 'checkin:1',
          data: { url: '/hoje' },
        },
      });
    });

    it('manda "skip" quando o botão é "Pulei"', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: true, json: async () => ({ title: 'Pulado', body: 'Corrida' }) })),
      );

      await click('skip', { token: 'token-abc' });

      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/api/push-actions',
        expect.objectContaining({ body: JSON.stringify({ token: 'token-abc', action: 'skip' }) }),
      );
    });

    it('avisa as abas abertas depois de marcar (para atualizar Hoje, XP, quest...)', async () => {
      const postMessage = vi.fn();
      worker.clientsList.push({ focus: vi.fn(), navigate: vi.fn(), postMessage } as never);
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: true, json: async () => ({ title: 't', body: 'b' }) })),
      );

      await click('complete', { token: 'token-abc' });

      expect(postMessage).toHaveBeenCalledWith({ type: 'lifexp-checkin' });
    });

    it('sem token (dado corrompido), falha sem chamar a API', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      await click('complete', { url: '/hoje' }); // sem "token"

      expect(fetchMock).not.toHaveBeenCalled();
      expect(worker.shown.at(-1)).toMatchObject({ title: 'Não consegui marcar' });
    });

    it('resposta não-OK ou falha de rede: mostra erro, e o toque abre Hoje', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: false })),
      );
      await click('complete', { token: 'token-abc' });
      expect(worker.shown.at(-1)).toMatchObject({
        title: 'Não consegui marcar',
        options: { data: { url: '/hoje' } },
      });

      worker.shown.length = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new Error('offline');
        }),
      );
      await click('complete', { token: 'token-abc' });
      expect(worker.shown.at(-1)).toMatchObject({ title: 'Não consegui marcar' });
    });
  });
});
