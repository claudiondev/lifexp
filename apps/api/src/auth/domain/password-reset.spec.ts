import {
  RESET_COOLDOWN_MIN,
  RESET_TOKEN_TTL_MIN,
  buildResetEmail,
  buildResetUrl,
  computeResetExpiry,
  generateResetToken,
  hashResetToken,
  isInCooldown,
  isResetTokenUsable,
} from './password-reset.js';
import { resetPasswordSchema } from '@lifexp/shared';

const NOW = new Date('2026-10-07T15:00:00.000Z');
const at = (ms: number) => new Date(NOW.getTime() + ms);
const MIN = 60_000;

describe('token de recuperação', () => {
  it('é aleatório, tem 256 bits em base64url e passa no schema da API', () => {
    const tokens = new Set(Array.from({ length: 50 }, generateResetToken));
    expect(tokens.size).toBe(50);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(resetPasswordSchema.safeParse({ token, password: 'senha-nova-123' }).success).toBe(
        true,
      );
    }
  });

  it('o hash é SHA-256 em hexadecimal, determinístico e diferente do token', () => {
    expect(hashResetToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    const token = generateResetToken();
    expect(hashResetToken(token)).toBe(hashResetToken(token));
    expect(hashResetToken(token)).not.toContain(token);
    expect(hashResetToken(token)).not.toBe(hashResetToken(`${token}x`));
  });
});

describe('validade (RS12)', () => {
  it('expira em 30 minutos', () => {
    expect(RESET_TOKEN_TTL_MIN).toBe(30);
    expect(computeResetExpiry(NOW)).toEqual(at(30 * MIN));
  });

  it('vale até o último milissegundo; no instante da expiração já não vale', () => {
    const token = { expiresAt: at(30 * MIN), usedAt: null };
    expect(isResetTokenUsable(token, NOW)).toBe(true);
    expect(isResetTokenUsable(token, at(30 * MIN - 1))).toBe(true);
    expect(isResetTokenUsable(token, at(30 * MIN))).toBe(false);
    expect(isResetTokenUsable(token, at(31 * MIN))).toBe(false);
  });

  it('token usado, ou inexistente, nunca vale', () => {
    expect(isResetTokenUsable({ expiresAt: at(30 * MIN), usedAt: at(MIN) }, at(2 * MIN))).toBe(
      false,
    );
    expect(isResetTokenUsable(null, NOW)).toBe(false);
  });
});

describe('intervalo entre pedidos', () => {
  it('sem pedido anterior, pode pedir', () => {
    expect(isInCooldown(null, NOW)).toBe(false);
  });

  it('segura novos e-mails por 2 minutos e libera exatamente ao fim', () => {
    expect(RESET_COOLDOWN_MIN).toBe(2);
    expect(isInCooldown(NOW, NOW)).toBe(true);
    expect(isInCooldown(NOW, at(2 * MIN - 1))).toBe(true);
    expect(isInCooldown(NOW, at(2 * MIN))).toBe(false);
    expect(isInCooldown(NOW, at(10 * MIN))).toBe(false);
  });
});

describe('link e e-mail', () => {
  it('o token vai no fragmento, nunca na query string, com ou sem barra no endereço do app', () => {
    expect(buildResetUrl('https://lifexp.app', 'tok_en-1')).toBe(
      'https://lifexp.app/redefinir-senha#token=tok_en-1',
    );
    expect(buildResetUrl('https://lifexp.app//', 'abc')).toBe(
      'https://lifexp.app/redefinir-senha#token=abc',
    );
    const url = new URL(buildResetUrl('http://localhost:5173', 'abc'));
    expect(url.search).toBe('');
    expect(url.hash).toBe('#token=abc');
  });

  it('o e-mail traz o link, a validade, o uso único e o que fazer se não foi a pessoa', () => {
    const email = buildResetEmail({ name: 'Ana Maria', url: 'https://x/redefinir-senha#token=t' });
    expect(email.subject).toBe('Redefinir sua senha do LifeXP');
    expect(email.text).toContain('Olá, Ana!');
    expect(email.text).toContain('https://x/redefinir-senha#token=t');
    expect(email.text).toContain('30 minutos');
    expect(email.text).toContain('só funciona uma vez');
    expect(email.text).toContain('Se não foi você, ignore este e-mail');
  });

  it('nome em branco não quebra a saudação', () => {
    expect(buildResetEmail({ name: '  ', url: 'u' }).text).toContain('Olá, olá!');
  });
});
