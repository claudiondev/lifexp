import type { CookieOptions } from 'express';

export const REFRESH_COOKIE_NAME = 'refresh_token';

// Path restrito: o navegador só envia o cookie para as rotas de auth, não para a API toda.
const REFRESH_COOKIE_PATH = '/api/auth';

export function refreshCookieOptions(secure: boolean, maxAgeMs?: number): CookieOptions {
  return {
    httpOnly: true,
    secure,
    // Strict funciona porque front e API ficam na mesma origem (proxy do Vite / rewrite da Vercel).
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    ...(maxAgeMs !== undefined && { maxAge: maxAgeMs }),
  };
}
