import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Rule {
  source: string;
  destination?: string;
  headers?: { key: string; value: string }[];
}
const config = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
  rewrites: Rule[];
  headers: Rule[];
  buildCommand: string;
  outputDirectory: string;
};

const headersFor = (source: string) =>
  Object.fromEntries(
    (config.headers.find((rule) => rule.source === source)?.headers ?? []).map((h) => [
      h.key,
      h.value,
    ]),
  );

describe('vercel.json (deploy do front)', () => {
  it('constrói o pacote compartilhado antes do front e publica a pasta dist', () => {
    expect(config.buildCommand.indexOf('@lifexp/shared build')).toBeGreaterThanOrEqual(0);
    expect(config.buildCommand.indexOf('@lifexp/shared build')).toBeLessThan(
      config.buildCommand.indexOf('@lifexp/web build'),
    );
    expect(config.outputDirectory).toBe('dist');
  });

  describe('rewrites', () => {
    it('/api/* vai para a API em https, mantendo o caminho (mesma origem: o cookie de sessão funciona)', () => {
      const api = config.rewrites[0]!;
      expect(api.source).toBe('/api/:path*');
      expect(api.destination).toMatch(/^https:\/\/[^/]+\/api\/:path\*$/);
    });

    it('a regra da API vem ANTES do fallback do app (senão /api/* cairia no index.html)', () => {
      const apiAt = config.rewrites.findIndex((rule) => rule.source.startsWith('/api/'));
      const spaAt = config.rewrites.findIndex((rule) => rule.destination === '/index.html');
      expect(apiAt).toBeGreaterThanOrEqual(0);
      expect(spaAt).toBeGreaterThan(apiAt);
    });

    it('as rotas do app (ex.: /hoje) caem no index.html', () => {
      const spa = config.rewrites.find((rule) => rule.destination === '/index.html')!;
      expect(spa.source).toBe('/(.*)');
    });
  });

  describe('cabeçalhos', () => {
    it('o service worker e o arquivo de push nunca ficam em cache (senão uma versão velha trava as atualizações)', () => {
      for (const file of ['/sw.js', '/push-sw.js']) {
        expect(headersFor(file)['Cache-Control']).toContain('no-cache');
      }
      expect(headersFor('/sw.js')['Service-Worker-Allowed']).toBe('/');
    });

    it('os arquivos com hash em /assets são imutáveis por um ano', () => {
      expect(headersFor('/assets/(.*)')['Cache-Control']).toBe(
        'public, max-age=31536000, immutable',
      );
    });

    it('o manifesto é revalidado', () => {
      expect(headersFor('/manifest.webmanifest')['Cache-Control']).toBe('no-cache');
    });

    it('todas as páginas levam os cabeçalhos de segurança', () => {
      const all = headersFor('/(.*)');
      expect(all['X-Content-Type-Options']).toBe('nosniff');
      expect(all['X-Frame-Options']).toBe('DENY');
      expect(all['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
      expect(all['Permissions-Policy']).toContain('camera=()');
      expect(all['Strict-Transport-Security']).toContain('max-age=');
    });
  });
});
