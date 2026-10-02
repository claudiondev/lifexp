import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  currentSubscription,
  isPushSupported,
  subscribeThisDevice,
  toSubscriptionInput,
  unsubscribeThisDevice,
  urlBase64ToUint8Array,
} from './pushBrowser';

afterEach(() => vi.unstubAllGlobals());

describe('urlBase64ToUint8Array', () => {
  it('converte base64url (com - e _, sem preenchimento) em bytes', () => {
    // "Hello?>" em base64 é SGVsbG8/Pg== ; em base64url, sem preenchimento: SGVsbG8_Pg
    expect([...urlBase64ToUint8Array('SGVsbG8_Pg')]).toEqual([
      ...new TextEncoder().encode('Hello?>'),
    ]);
  });

  it('aceita quando o tamanho já fecha o bloco de 4 (sem preenchimento a repor)', () => {
    expect([...urlBase64ToUint8Array('TWFu')]).toEqual([77, 97, 110]);
  });

  it('uma chave VAPID pública de verdade (65 bytes) vira 65 bytes começando em 0x04', () => {
    const key =
      'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
    const bytes = urlBase64ToUint8Array(key);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(4);
  });
});

describe('toSubscriptionInput', () => {
  const sub = (json: unknown) => ({ toJSON: () => json }) as unknown as PushSubscription;

  it('leva só o endereço e as chaves (sem expirationTime)', () => {
    expect(
      toSubscriptionInput(
        sub({
          endpoint: 'https://fcm.googleapis.com/x',
          expirationTime: null,
          keys: { p256dh: 'P', auth: 'A' },
        }),
      ),
    ).toEqual({ endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'P', auth: 'A' } });
  });

  it('inscrição incompleta do navegador vira erro claro, nunca um pedido pela metade', () => {
    for (const json of [
      {},
      { endpoint: 'https://x' },
      { endpoint: 'https://x', keys: { p256dh: 'P' } },
      { endpoint: 'https://x', keys: { auth: 'A' } },
      { keys: { p256dh: 'P', auth: 'A' } },
    ]) {
      expect(() => toSubscriptionInput(sub(json))).toThrow('inscrição incompleta');
    }
  });
});

describe('isPushSupported', () => {
  it('exige service worker, PushManager e Notification', () => {
    vi.stubGlobal('navigator', { serviceWorker: {} });
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('Notification', class {});
    expect(isPushSupported()).toBe(true);
  });

  it('falta qualquer um dos três: não suporta', () => {
    // jsdom não tem PushManager nem Notification nem serviceWorker por padrão
    expect(isPushSupported()).toBe(false);

    vi.stubGlobal('navigator', { serviceWorker: {} });
    vi.stubGlobal('Notification', class {});
    expect(isPushSupported()).toBe(false); // sem PushManager

    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('navigator', {});
    expect(isPushSupported()).toBe(false); // sem service worker
  });

  it('sem Notification (com service worker e PushManager), também não suporta', () => {
    vi.stubGlobal('navigator', { serviceWorker: {} });
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('Notification', undefined);
    delete (globalThis as { Notification?: unknown }).Notification;
    expect(isPushSupported()).toBe(false);
  });
});

describe('inscrição deste aparelho', () => {
  function stubRegistration(
    existing: { endpoint: string; unsubscribe: () => Promise<boolean> } | null,
  ) {
    const pushManager = {
      getSubscription: vi.fn(async () => existing),
      subscribe: vi.fn(async () => ({ endpoint: 'https://fcm.googleapis.com/novo' })),
    };
    vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve({ pushManager }) } });
    return pushManager;
  }

  it('currentSubscription devolve a inscrição do service worker (ou nulo)', async () => {
    stubRegistration(null);
    expect(await currentSubscription()).toBeNull();
    stubRegistration({ endpoint: 'https://x', unsubscribe: async () => true });
    expect((await currentSubscription())?.endpoint).toBe('https://x');
  });

  it('subscribeThisDevice pede inscrição visível, com a chave VAPID convertida em bytes', async () => {
    const pushManager = stubRegistration(null);
    await subscribeThisDevice('SGVsbG8_Pg');

    const [options] = pushManager.subscribe.mock.calls[0] as unknown as [
      { userVisibleOnly: boolean; applicationServerKey: Uint8Array },
    ];
    expect(options.userVisibleOnly).toBe(true);
    expect([...options.applicationServerKey]).toEqual([...new TextEncoder().encode('Hello?>')]);
  });

  it('unsubscribeThisDevice cancela e devolve o endereço; sem inscrição devolve nulo', async () => {
    const unsubscribe = vi.fn(async () => true);
    stubRegistration({ endpoint: 'https://fcm.googleapis.com/meu', unsubscribe });
    expect(await unsubscribeThisDevice()).toBe('https://fcm.googleapis.com/meu');
    expect(unsubscribe).toHaveBeenCalledTimes(1);

    stubRegistration(null);
    expect(await unsubscribeThisDevice()).toBeNull();
  });
});
