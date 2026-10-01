import { computeRefreshExpiry, generateRefreshToken, hashRefreshToken } from './refresh-token.js';

describe('refresh token', () => {
  it('gera tokens únicos e longos o bastante', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43); // 32 bytes em base64url
  });

  it('hash é determinístico e diferente do token', () => {
    const token = generateRefreshToken();
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
    expect(hashRefreshToken(token)).not.toBe(token);
    expect(hashRefreshToken(token)).toHaveLength(64);
  });

  it('calcula a expiração em dias', () => {
    const now = new Date('2026-10-01T12:00:00.000Z');
    expect(computeRefreshExpiry(now, 7).toISOString()).toBe('2026-10-08T12:00:00.000Z');
  });
});
