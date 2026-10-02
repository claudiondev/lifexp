/**
 * Só estes destinos viram link numa nota: `http(s)://` e `mailto:`. Tudo o mais (javascript:, data:,
 * vbscript:, file:, caminhos relativos, "//host") vira texto simples. Lista de PERMITIDOS, não de
 * proibidos: variações como "JaVaScRiPt:" ou "java\tscript:" nunca passam por serem desconhecidas.
 */
const ALLOWED = /^(?:https?:\/\/[^\s]+|mailto:[^\s]+)$/i;

/** Devolve o endereço limpo, ou `null` se não for um destino permitido. */
export function safeHref(url: string | undefined | null): string | null {
  if (!url) return null;
  // Espaços e caracteres de controle nas pontas e no meio são truque conhecido para burlar filtros.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F-\u009F\s]/.test(url)) return null;
  return ALLOWED.test(url) ? url : null;
}

/** `mailto:` abre o programa de e-mail; só os de `http(s)` ganham `target="_blank"`. */
export const isWebLink = (href: string): boolean => /^https?:\/\//i.test(href);
