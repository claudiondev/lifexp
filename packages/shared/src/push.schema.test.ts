import { describe, expect, it } from 'vitest';
import {
  isAllowedPushEndpoint,
  pushConfigSchema,
  pushSubscriptionInputSchema,
  pushUnsubscribeSchema,
} from './push.schema.js';

const FCM = 'https://fcm.googleapis.com/fcm/send/abc123';
const keys = {
  p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
  auth: 'tBHItJI5svbpez7KI4CCXg',
};
const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

describe('isAllowedPushEndpoint', () => {
  it('aceita os serviços de push dos navegadores, e subdomínios deles', () => {
    for (const endpoint of [
      FCM,
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://wns2-par02p.notify.windows.com/w/?token=abc',
      'https://web.push.apple.com/QNAv',
      'https://FCM.googleapis.com/x',
      'https://fcm.googleapis.com:443/x',
      'https://fcm.googleapis.com',
    ]) {
      expect(isAllowedPushEndpoint(endpoint), endpoint).toBe(true);
    }
  });

  it('recusa qualquer outro host: o servidor não envia para onde o cliente mandar (SSRF)', () => {
    for (const endpoint of [
      'https://evil.example.com/push',
      'https://localhost/push',
      'https://127.0.0.1/push',
      'https://169.254.169.254/latest/meta-data',
      'https://[::1]/push',
      'https://internal/push',
    ]) {
      expect(isAllowedPushEndpoint(endpoint), endpoint).toBe(false);
    }
  });

  it('recusa truques de URL: usuário/senha, host dentro do caminho, sufixo falso, barra invertida', () => {
    for (const endpoint of [
      'https://fcm.googleapis.com@evil.com/x',
      'https://evil.com\\@fcm.googleapis.com/x',
      'https://evil.com/fcm.googleapis.com',
      'https://evil.com?fcm.googleapis.com',
      'https://fcm.googleapis.com.evil.com/x',
      'https://notfcm.googleapis.com.evil.com/x',
      'https://evilfcm.googleapis.com/x',
      'https://fcm.googleapis.com:8443/x',
      'https://fcm.googleapis.com:443@evil.com/x',
      'https://fcm.googleapis.com /x',
    ]) {
      expect(isAllowedPushEndpoint(endpoint), endpoint).toBe(false);
    }
  });

  it('recusa o que não é https ou nem é URL', () => {
    for (const endpoint of [
      'http://fcm.googleapis.com/x',
      'ftp://fcm.googleapis.com/x',
      'fcm.googleapis.com/x',
      '//fcm.googleapis.com/x',
      '',
      'não é url',
    ]) {
      expect(isAllowedPushEndpoint(endpoint), endpoint).toBe(false);
    }
  });
});

describe('pushSubscriptionInputSchema', () => {
  it('aceita o que o navegador entrega', () => {
    expect(ok(pushSubscriptionInputSchema, { endpoint: FCM, keys })).toBe(true);
  });

  it('recusa host desconhecido, chaves fora do formato e campos a mais (RS07)', () => {
    expect(ok(pushSubscriptionInputSchema, { endpoint: 'https://evil.com/x', keys })).toBe(false);
    expect(
      ok(pushSubscriptionInputSchema, { endpoint: FCM, keys: { ...keys, auth: 'tem espaço!' } }),
    ).toBe(false);
    expect(
      ok(pushSubscriptionInputSchema, { endpoint: FCM, keys: { ...keys, p256dh: 'curta' } }),
    ).toBe(false);
    expect(ok(pushSubscriptionInputSchema, { endpoint: FCM, keys, userId: 'x' })).toBe(false);
    expect(ok(pushSubscriptionInputSchema, { endpoint: FCM })).toBe(false);
    expect(ok(pushSubscriptionInputSchema, { endpoint: `${FCM}${'a'.repeat(2100)}`, keys })).toBe(
      false,
    );
  });
});

describe('outros schemas de push', () => {
  it('cancelar a inscrição só pede o endpoint', () => {
    expect(ok(pushUnsubscribeSchema, { endpoint: FCM })).toBe(true);
    expect(ok(pushUnsubscribeSchema, { endpoint: FCM, extra: 1 })).toBe(false);
  });

  it('a configuração informa se o push está ligado no servidor', () => {
    expect(ok(pushConfigSchema, { enabled: false, publicKey: null })).toBe(true);
    expect(ok(pushConfigSchema, { enabled: true, publicKey: 'BKey' })).toBe(true);
    expect(ok(pushConfigSchema, { enabled: true })).toBe(false);
  });
});
