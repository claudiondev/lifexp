// Gera os ícones do PWA a partir de scripts/icon.svg. Rodar com `pnpm icons` quando o SVG mudar;
// os PNGs ficam versionados em public/icons para o build não depender do sharp.
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'icons');
const svg = await readFile(join(root, 'scripts', 'icon.svg'));
await mkdir(out, { recursive: true });

const png = (size, file) =>
  sharp(svg, { density: 384 }).resize(size, size).png().toFile(join(out, file));

/** Maskable: o desenho ocupa só ~70% central (zona segura), com o fundo escuro até a borda. */
const maskable = async (size, file) => {
  const inner = Math.round(size * 0.7);
  const glyph = await sharp(svg, { density: 384 }).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: '#05070d' } })
    .composite([{ input: glyph, gravity: 'center' }])
    .png()
    .toFile(join(out, file));
};

await Promise.all([
  png(192, 'icon-192.png'),
  png(512, 'icon-512.png'),
  png(180, 'apple-touch-icon.png'),
  maskable(512, 'maskable-512.png'),
]);
console.log('Ícones gerados em public/icons');
