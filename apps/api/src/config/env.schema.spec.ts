import { validateEnv } from './env.schema.js';

const base = { DATABASE_URL: 'postgresql://x', JWT_ACCESS_SECRET: 'x'.repeat(32) };

describe('validateEnv', () => {
  it('aplica defaults e converte tipos', () => {
    const env = validateEnv({ ...base, PORT: '4000' });
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.ACCESS_TTL_SECONDS).toBe(900);
    expect(env.REFRESH_TTL_DAYS).toBe(7);
    expect(env.COOKIE_SECURE).toBe(false);
  });

  it('interpreta COOKIE_SECURE como booleano de verdade', () => {
    expect(validateEnv({ ...base, COOKIE_SECURE: 'true' }).COOKIE_SECURE).toBe(true);
    expect(validateEnv({ ...base, COOKIE_SECURE: 'false' }).COOKIE_SECURE).toBe(false);
  });

  it('configura a varredura de notificações e o e-mail, com padrões seguros', () => {
    const env = validateEnv(base);
    expect(env.NOTIFICATIONS_SCHEDULER).toBe(true);
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.APP_URL).toBe('http://localhost:5173');
    expect(env.MAIL_FROM).toContain('LifeXP');

    expect(validateEnv({ ...base, NOTIFICATIONS_SCHEDULER: 'false' }).NOTIFICATIONS_SCHEDULER).toBe(
      false,
    );
    expect(validateEnv({ ...base, RESEND_API_KEY: 're_abc' }).RESEND_API_KEY).toBe('re_abc');
    expect(() => validateEnv({ ...base, APP_URL: 'não é url' })).toThrow(/APP_URL/);
    expect(() => validateEnv({ ...base, RESEND_API_KEY: '' })).toThrow(/RESEND_API_KEY/);
    expect(() => validateEnv({ ...base, NOTIFICATIONS_SCHEDULER: 'talvez' })).toThrow(
      /NOTIFICATIONS_SCHEDULER/,
    );
  });

  it('push (RF41): desligado por padrão, e as duas chaves VAPID vêm juntas ou nenhuma', () => {
    const env = validateEnv(base);
    expect(env.VAPID_PUBLIC_KEY).toBeUndefined();
    expect(env.VAPID_PRIVATE_KEY).toBeUndefined();
    expect(env.VAPID_SUBJECT).toBe('mailto:contato@lifexp.app');

    const keys = { VAPID_PUBLIC_KEY: 'P'.repeat(60), VAPID_PRIVATE_KEY: 'k'.repeat(30) };
    expect(validateEnv({ ...base, ...keys }).VAPID_PUBLIC_KEY).toBe(keys.VAPID_PUBLIC_KEY);
    expect(() => validateEnv({ ...base, VAPID_PUBLIC_KEY: keys.VAPID_PUBLIC_KEY })).toThrow(
      /VAPID/,
    );
    expect(() => validateEnv({ ...base, VAPID_PRIVATE_KEY: keys.VAPID_PRIVATE_KEY })).toThrow(
      /VAPID/,
    );
  });

  it('o subject do push é mailto: ou https:', () => {
    const keys = { VAPID_PUBLIC_KEY: 'P'.repeat(60), VAPID_PRIVATE_KEY: 'k'.repeat(30) };
    expect(
      validateEnv({ ...base, ...keys, VAPID_SUBJECT: 'mailto:eu@exemplo.com' }).VAPID_SUBJECT,
    ).toBe('mailto:eu@exemplo.com');
    expect(
      validateEnv({ ...base, ...keys, VAPID_SUBJECT: 'https://exemplo.com' }).VAPID_SUBJECT,
    ).toBe('https://exemplo.com');
    for (const bad of ['eu@exemplo.com', 'http://exemplo.com', 'mailto:', 'ftp://x.com']) {
      expect(() => validateEnv({ ...base, ...keys, VAPID_SUBJECT: bad }), bad).toThrow(
        /VAPID_SUBJECT/,
      );
    }
  });

  it('falha quando DATABASE_URL está ausente', () => {
    expect(() => validateEnv({ JWT_ACCESS_SECRET: base.JWT_ACCESS_SECRET })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('falha com segredo JWT curto', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'curto' })).toThrow(/JWT_ACCESS_SECRET/);
  });
});
