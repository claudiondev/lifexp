/**
 * O token de recuperação chega no FRAGMENTO do link (`#token=...`): o navegador não envia o
 * fragmento ao servidor, então ele não fica em log de acesso nem no cabeçalho Referer.
 */
export function readResetToken(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('token');
  return token && /^[A-Za-z0-9_-]{32,128}$/.test(token) ? token : null;
}
