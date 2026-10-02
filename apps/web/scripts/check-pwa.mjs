// Confere o que o build realmente gerou (roda no fim de `pnpm build`, então o CI também pega):
// manifesto instalável, ícones existentes, service worker presente e a API fora do cache.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const problems = [];
const check = (condition, message) => condition || problems.push(message);

const read = (file) =>
  existsSync(join(dist, file)) ? readFileSync(join(dist, file), 'utf8') : null;

const rawManifest = read('manifest.webmanifest');
check(rawManifest !== null, 'dist/manifest.webmanifest não foi gerado');
if (rawManifest !== null) {
  const manifest = JSON.parse(rawManifest);
  for (const field of ['name', 'short_name', 'start_url', 'scope', 'display', 'theme_color']) {
    check(Boolean(manifest[field]), `manifesto sem "${field}"`);
  }
  check(manifest.display === 'standalone', 'display deve ser "standalone" (instalável como app)');
  check(
    manifest.start_url?.startsWith(manifest.scope ?? '/'),
    'start_url precisa estar dentro do scope',
  );

  const icons = manifest.icons ?? [];
  const has = (size, purpose) =>
    icons.some((i) => i.sizes === size && (purpose ? i.purpose === purpose : !i.purpose));
  check(has('192x192'), 'falta ícone 192x192');
  check(has('512x512'), 'falta ícone 512x512');
  check(has('512x512', 'maskable'), 'falta ícone maskable 512x512');
  for (const icon of icons) {
    check(existsSync(join(dist, icon.src)), `ícone ${icon.src} não existe em dist`);
  }
}

const sw = read('sw.js');
check(sw !== null, 'dist/sw.js não foi gerado');
if (sw !== null) {
  check(sw.includes('NetworkOnly'), 'o service worker deve tratar /api com NetworkOnly');
  check(sw.includes('/api/'), 'o service worker não menciona /api');
  check(sw.includes('denylist') || sw.includes('NavigationRoute'), 'sem fallback de navegação');
}

// Push (RF41): o service worker precisa carregar o arquivo dos tratadores, e ele precisa estar no build.
if (sw !== null)
  check(sw.includes('push-sw.js'), 'o service worker não carrega /push-sw.js (push)');
const pushSw = read('push-sw.js');
check(pushSw !== null, 'dist/push-sw.js não foi gerado');
if (pushSw !== null) {
  check(pushSw.includes("'push'"), 'push-sw.js sem o tratador de "push"');
  check(pushSw.includes("'notificationclick'"), 'push-sw.js sem o tratador de "notificationclick"');
}

const html = read('index.html');
check(html?.includes('rel="manifest"'), 'index.html não liga o manifesto');
check(html?.includes('apple-touch-icon'), 'index.html sem apple-touch-icon');

if (problems.length > 0) {
  console.error(`PWA inválido:\n - ${problems.join('\n - ')}`);
  process.exit(1);
}
console.log('PWA ok: manifesto, ícones e service worker conferidos.');
