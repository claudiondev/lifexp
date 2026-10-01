import { REFRESH_COOKIE_NAME, refreshCookieOptions } from './refresh-cookie.js';

describe('refreshCookieOptions (RS03)', () => {
  it('é sempre httpOnly, SameSite=Strict e restrito ao path de auth', () => {
    const options = refreshCookieOptions(false);
    expect(options).toMatchObject({ httpOnly: true, sameSite: 'strict', path: '/api/auth' });
  });

  it('só marca Secure quando configurado (produção em HTTPS)', () => {
    expect(refreshCookieOptions(true).secure).toBe(true);
    expect(refreshCookieOptions(false).secure).toBe(false);
  });

  it('inclui maxAge apenas quando informado (limpar o cookie não usa maxAge)', () => {
    expect(refreshCookieOptions(true, 5000).maxAge).toBe(5000);
    expect('maxAge' in refreshCookieOptions(true)).toBe(false);
  });

  it('usa um nome de cookie estável', () => {
    expect(REFRESH_COOKIE_NAME).toBe('refresh_token');
  });
});
