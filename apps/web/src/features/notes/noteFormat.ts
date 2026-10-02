import { normalizeTag, tagSchema, NOTE_TAGS_MAX, type NoteLinkType } from '@lifexp/shared';

export const LINK_TYPE_LABEL: Record<NoteLinkType, string> = {
  area: 'Área',
  goal: 'Meta',
  event: 'Evento',
  block: 'Bloco',
};

/** "Meta: Escrever o livro". */
export const linkText = (link: { type: NoteLinkType; label: string }): string =>
  `${LINK_TYPE_LABEL[link.type]}: ${link.label}`;

/** "7 out", no fuso da pessoa. Montado pelas partes: o Intl em pt-BR escreveria "7 de out.". */
export function shortDate(iso: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'short',
    timeZone: timezone,
  }).formatToParts(new Date(iso));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('day')} ${part('month').replace('.', '')}`;
}

export type TagAddResult = { ok: true; tags: string[] } | { ok: false; message: string };

/**
 * Adiciona o que a pessoa digitou à lista de tags: normaliza ("#Saúde Mental" vira "saúde-mental"),
 * ignora repetida e respeita o limite. Vários separados por vírgula entram de uma vez.
 */
export function addTags(current: readonly string[], typed: string): TagAddResult {
  const pieces = typed
    .split(',')
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0);
  const next = [...current];
  for (const piece of pieces) {
    const parsed = tagSchema.safeParse(piece);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? 'Tag inválida' };
    }
    if (next.includes(parsed.data)) continue;
    if (next.length >= NOTE_TAGS_MAX)
      return { ok: false, message: `No máximo ${NOTE_TAGS_MAX} tags` };
    next.push(parsed.data);
  }
  return { ok: true, tags: next };
}

export { normalizeTag };
