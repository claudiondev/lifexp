/**
 * Tira de um texto o que não pode ir para o log nem para o estado dos jobs (RNF13, RS14): e-mails, tokens, chaves,
 * senhas e endereços de push. É uma rede de segurança: o código já evita logar dado sensível, e isto pega o que
 * escapar numa mensagem de erro de biblioteca.
 */

const maskEmail = (_match: string, user: string, domain: string): string =>
  `${user.slice(0, 1)}***@${domain}`;

const RULES: readonly [RegExp, string | ((...args: string[]) => string)][] = [
  // Credenciais em URL de conexão: postgresql://usuario:senha@host
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+(?::[^\s/@]*)?@/gi, '$1[redigido]@'],
  // Endereço de push: o caminho identifica o aparelho (segredo); só o host é público.
  [
    /(https:\/\/(?:[a-z0-9-]+\.)*(?:fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com))\/[^\s"']*/gi,
    '$1/[redigido]',
  ],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redigido]'],
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, '[jwt]'],
  // password=..., "token": "...", authorization: ...
  [
    /(\b(?:password|passwd|senha|token|secret|authorization|api[_-]?key|refresh[_-]?token|access[_-]?token|private[_-]?key)\b["']?\s*[:=]\s*)(["']?)[^\s"',;&]+/gi,
    '$1$2[redigido]',
  ],
  [/\b([a-z0-9._%+-]+)@([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})\b/gi, maskEmail],
  // Hashes e tokens soltos: sequências longas em hexadecimal ou base64url.
  [/\b[A-Fa-f0-9]{32,}\b/g, '[hex]'],
  [/\b[A-Za-z0-9_-]{40,}\b/g, '[token]'],
];

export function redact(text: string): string {
  let result = text;
  for (const [pattern, replacement] of RULES) {
    result = result.replace(pattern, replacement as string);
  }
  return result;
}

/** Corta um texto longo (mensagens de erro enormes não precisam ir inteiras para o estado ou para o log). */
export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
