/**
 * Escapa os coringas do LIKE/ILIKE (`%`, `_`) e a própria barra de escape: o Prisma NÃO faz isso no
 * `contains`, então buscar "%" ou "_" casaria com tudo. Depois disto o texto é buscado literalmente.
 * (O Postgres usa a barra invertida como escape padrão do LIKE.)
 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}
