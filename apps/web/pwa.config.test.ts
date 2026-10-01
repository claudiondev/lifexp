import { describe, expect, it } from 'vitest';
import { manifest, workbox } from './pwa.config';

describe('manifesto do PWA', () => {
  it('é um app instalável que abre nas missões do dia', () => {
    expect(manifest).toMatchObject({
      name: 'LifeXP',
      display: 'standalone',
      start_url: '/hoje',
      scope: '/',
      lang: 'pt-BR',
    });
    expect(manifest.start_url?.startsWith(manifest.scope ?? '')).toBe(true);
  });

  it('traz ícones 192, 512 e um maskable', () => {
    const icons = manifest.icons ?? [];
    expect(icons.map((icon) => `${icon.sizes}${icon.purpose ? `:${icon.purpose}` : ''}`)).toEqual([
      '192x192',
      '512x512',
      '512x512:maskable',
    ]);
  });
});

describe('service worker', () => {
  const rule = workbox?.runtimeCaching?.[0];
  const matches = (path: string) => {
    const pattern = rule?.urlPattern;
    if (typeof pattern !== 'function') throw new Error('esperava uma função');
    return Boolean(
      (pattern as (ctx: { url: URL }) => boolean)({ url: new URL(`https://x.test${path}`) }),
    );
  };

  it('nunca cacheia a API: /api/* vai sempre à rede', () => {
    expect(rule?.handler).toBe('NetworkOnly');
    expect(matches('/api/progress')).toBe(true);
    expect(matches('/api/blocks/week?weekStart=2026-10-05')).toBe(true);
  });

  it('não trata como API as telas do app', () => {
    expect(matches('/hoje')).toBe(false);
    expect(matches('/semana')).toBe(false);
    expect(matches('/apinha')).toBe(false);
  });

  it('o fallback de navegação não engole /api', () => {
    const [denied] = workbox?.navigateFallbackDenylist ?? [];
    expect(denied?.test('/api/docs')).toBe(true);
    expect(denied?.test('/hoje')).toBe(false);
    expect(workbox?.navigateFallback).toBe('/index.html');
  });
});
