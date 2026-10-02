import { Logger } from '@nestjs/common';
import webpush from 'web-push';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DisabledPushSender, maskEndpoint } from './log-push.sender.js';
import { createPushSender } from './push-sender.factory.js';
import type { PushPayload, PushTarget } from './push-sender.js';
import { PUSH_TIMEOUT_MS, PUSH_TTL_SECONDS, WebPushSender } from './web-push.sender.js';

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/SEGREDO-DO-APARELHO-123';
const target = (over: Partial<PushTarget> = {}): PushTarget => ({
  endpoint: ENDPOINT,
  keys: {
    p256dh:
      'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
    auth: 'tBHItJI5svbpez7KI4CCXg',
  },
  ...over,
});
const payload: PushPayload = { title: 'Corrida', body: 'em 15 min', url: '/hoje', tag: 'block:1' };

describe('maskEndpoint', () => {
  it('mostra só o host: o caminho identifica o aparelho e é segredo', () => {
    expect(maskEndpoint(ENDPOINT)).toBe('fcm.googleapis.com');
    expect(maskEndpoint('https://FCM.googleapis.com:443/x?y=1')).toBe('fcm.googleapis.com');
    expect(maskEndpoint('lixo')).toBe('endereço inválido');
  });
});

describe('DisabledPushSender', () => {
  it('está desligado, sem chave pública, e não entrega nada', async () => {
    const sender = new DisabledPushSender();
    expect(sender.enabled).toBe(false);
    expect(sender.publicKey).toBeNull();
    expect(await sender.send(target(), payload)).toBe('failed');
  });
});

describe('WebPushSender', () => {
  const vapid = webpush.generateVAPIDKeys();
  const config = {
    subject: 'mailto:contato@exemplo.com',
    publicKey: vapid.publicKey,
    privateKey: vapid.privateKey,
  };
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('está ligado e expõe a chave pública VAPID', () => {
    const sender = new WebPushSender(config);
    expect(sender.enabled).toBe(true);
    expect(sender.publicKey).toBe(vapid.publicKey);
  });

  it('envia o texto como JSON, com TTL, tempo limite e as chaves VAPID, e devolve "sent"', async () => {
    const send = vi
      .spyOn(webpush, 'sendNotification')
      .mockResolvedValue({ statusCode: 201, body: '', headers: {} });

    expect(await new WebPushSender(config).send(target(), payload)).toBe('sent');

    expect(send).toHaveBeenCalledTimes(1);
    const [subscription, body, options] = send.mock.calls[0]!;
    expect(subscription).toEqual({ endpoint: ENDPOINT, keys: target().keys });
    expect(JSON.parse(String(body))).toEqual(payload);
    expect(options).toMatchObject({
      TTL: PUSH_TTL_SECONDS,
      timeout: PUSH_TIMEOUT_MS,
      urgency: 'normal',
      vapidDetails: config,
    });
  });

  it('404 e 410 viram "gone": a inscrição foi cancelada pelo navegador', async () => {
    for (const statusCode of [404, 410]) {
      vi.spyOn(webpush, 'sendNotification').mockRejectedValue(
        Object.assign(new Error('gone'), { statusCode }),
      );
      expect(await new WebPushSender(config).send(target(), payload)).toBe('gone');
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it('outros erros (5xx, 429, rede) viram "failed", sem lançar', async () => {
    for (const error of [
      Object.assign(new Error('x'), { statusCode: 500 }),
      Object.assign(new Error('x'), { statusCode: 429 }),
      Object.assign(new Error('x'), { statusCode: 400 }),
      new Error('ECONNRESET'),
    ]) {
      vi.spyOn(webpush, 'sendNotification').mockRejectedValue(error);
      expect(await new WebPushSender(config).send(target(), payload)).toBe('failed');
    }
  });

  it('o log de falha nunca leva o endereço completo, as chaves do aparelho nem a chave privada (RS14)', async () => {
    vi.spyOn(webpush, 'sendNotification').mockRejectedValue(
      Object.assign(new Error(`falhou em ${ENDPOINT} com ${config.privateKey}`), {
        statusCode: 500,
      }),
    );

    await new WebPushSender(config).send(target(), payload);

    expect(warn).toHaveBeenCalledTimes(1);
    const logged = String(warn.mock.calls[0]![0]);
    expect(logged).toContain('fcm.googleapis.com');
    for (const secret of [
      'SEGREDO-DO-APARELHO',
      config.privateKey,
      target().keys.auth,
      target().keys.p256dh,
    ]) {
      expect(logged).not.toContain(secret);
    }
  });

  it('a configuração é aceita de verdade pela biblioteca: monta o pedido criptografado com VAPID, sem rede', async () => {
    // Uma assinatura real (par de chaves do "navegador") e o pedido que a biblioteca montaria; só não envia.
    const { createECDH, randomBytes } = await import('node:crypto');
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    const subscription = {
      endpoint: ENDPOINT,
      keys: {
        p256dh: ecdh.getPublicKey().toString('base64url'),
        auth: randomBytes(16).toString('base64url'),
      },
    };
    let built: ReturnType<typeof webpush.generateRequestDetails> | undefined;
    vi.spyOn(webpush, 'sendNotification').mockImplementation(async (sub, body, options) => {
      built = webpush.generateRequestDetails(sub, body as string, options);
      return { statusCode: 201, body: '', headers: {} };
    });

    const outcome = await new WebPushSender(config).send(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      payload,
    );

    expect(outcome).toBe('sent');
    expect(built?.endpoint).toBe(ENDPOINT);
    expect(built?.headers['Authorization']).toMatch(/^vapid t=.+, k=.+$/);
    expect(built?.headers['Content-Encoding']).toBe('aes128gcm');
    expect(String(built?.headers['TTL'])).toBe(String(PUSH_TTL_SECONDS));
    // o corpo vai cifrado: o texto do aviso não aparece em claro
    expect(Buffer.isBuffer(built?.body)).toBe(true);
    expect((built!.body as Buffer).toString('utf8')).not.toContain('Corrida');
  });
});

describe('createPushSender', () => {
  const keys = webpush.generateVAPIDKeys();
  const subject = 'mailto:contato@exemplo.com';

  it('com as duas chaves VAPID, liga o push de verdade e expõe a chave pública', () => {
    const sender = createPushSender({ ...keys, subject });
    expect(sender).toBeInstanceOf(WebPushSender);
    expect(sender.enabled).toBe(true);
    expect(sender.publicKey).toBe(keys.publicKey);
  });

  it('leva o subject e as chaves para cada envio', async () => {
    const send = vi
      .spyOn(webpush, 'sendNotification')
      .mockResolvedValue({ statusCode: 201, body: '', headers: {} });
    const sender = createPushSender({ ...keys, subject });

    await sender.send(target(), payload);

    expect(send.mock.calls[0]![2]).toMatchObject({
      vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
    });
    send.mockRestore();
  });

  it('sem alguma das chaves, fica desligado (nunca meio configurado)', () => {
    for (const partial of [{}, { publicKey: keys.publicKey }, { privateKey: keys.privateKey }]) {
      const sender = createPushSender({ ...partial, subject });
      expect(sender).toBeInstanceOf(DisabledPushSender);
      expect(sender.enabled).toBe(false);
      expect(sender.publicKey).toBeNull();
    }
  });
});
