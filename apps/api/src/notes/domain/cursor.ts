/** A posição de uma nota na lista: fixadas primeiro, depois as alteradas há menos tempo, desempate pelo id. */
export interface NoteCursor {
  pinned: boolean;
  updatedAt: Date;
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O cursor é opaco para o cliente: um texto base64url que ele só devolve como veio. */
export function encodeCursor(cursor: NoteCursor): string {
  return Buffer.from(
    JSON.stringify([cursor.pinned ? 1 : 0, cursor.updatedAt.getTime(), cursor.id]),
  ).toString('base64url');
}

/** Devolve nulo para qualquer texto que não seja um cursor que NÓS emitimos (nada de confiar no que veio). */
export function decodeCursor(text: string): NoteCursor | null {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(text, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!Array.isArray(value) || value.length !== 3) return null;
  const [pinned, millis, id] = value as unknown[];
  if (pinned !== 0 && pinned !== 1) return null;
  if (typeof millis !== 'number' || !Number.isInteger(millis)) return null;
  const updatedAt = new Date(millis);
  if (Number.isNaN(updatedAt.getTime())) return null;
  if (typeof id !== 'string' || !UUID.test(id)) return null;
  return { pinned: pinned === 1, updatedAt, id };
}

/**
 * Condição para "as notas DEPOIS deste cursor" na ordem (fixada desc, atualizada desc, id desc):
 * as fixadas só vêm antes das não fixadas, então depois de uma fixada vêm as não fixadas inteiras.
 */
export function afterCursor(cursor: NoteCursor) {
  const sameGroup = { pinned: cursor.pinned };
  return {
    OR: [
      ...(cursor.pinned ? [{ pinned: false }] : []),
      { ...sameGroup, updatedAt: { lt: cursor.updatedAt } },
      { ...sameGroup, updatedAt: cursor.updatedAt, id: { lt: cursor.id } },
    ],
  };
}
