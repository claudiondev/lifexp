export const EXCERPT_LENGTH = 160;

/**
 * Um trecho do texto para reconhecer a nota na lista: sem a sintaxe de markdown mais comum, com os
 * espaços e quebras de linha compactados, e cortado em `max` caracteres (com "…" quando corta).
 * Conta por caractere inteiro (um emoji nunca é cortado no meio).
 */
export function makeExcerpt(content: string, max = EXCERPT_LENGTH): string {
  const plain = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/[`*_~#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = Array.from(plain);
  return chars.length <= max ? plain : `${chars.slice(0, max).join('').trimEnd()}…`;
}
