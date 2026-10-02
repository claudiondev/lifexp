import { afterCursor, decodeCursor, encodeCursor, type NoteCursor } from './cursor.js';

const id = '0192f1a0-7b3c-7000-8000-0000000000a1';
const cursor: NoteCursor = { pinned: true, updatedAt: new Date('2026-10-07T15:00:00.123Z'), id };

describe('cursor das notas', () => {
  it('ida e volta: o que foi emitido é entendido, com os milissegundos', () => {
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    const unpinned = { ...cursor, pinned: false };
    expect(decodeCursor(encodeCursor(unpinned))).toEqual(unpinned);
  });

  it('só usa caracteres seguros para a URL (o schema da query os exige)', () => {
    expect(encodeCursor(cursor)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('o que não foi emitido por nós vira nulo, sem lançar erro', () => {
    const forge = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const bad = [
      '',
      'abc',
      '!!!',
      forge('texto'),
      forge({}),
      forge([]),
      forge([1, 123]),
      forge([1, 123, id, 'extra']),
      forge([2, 123, id]),
      forge([true, 123, id]),
      forge([1, '123', id]),
      forge([1, 1.5, id]),
      forge([1, 8.64e15 + 1, id]),
      forge([1, 123, 'não-é-uuid']),
      forge([1, 123, `${id}'; DROP TABLE "Note"`]),
      forge([1, 123, null]),
    ];
    for (const text of bad) expect([text, decodeCursor(text)]).toEqual([text, null]);
  });
});

describe('afterCursor', () => {
  it('depois de uma fixada vêm as não fixadas inteiras e as fixadas mais antigas', () => {
    expect(afterCursor(cursor)).toEqual({
      OR: [
        { pinned: false },
        { pinned: true, updatedAt: { lt: cursor.updatedAt } },
        { pinned: true, updatedAt: cursor.updatedAt, id: { lt: id } },
      ],
    });
  });

  it('depois de uma não fixada só vêm não fixadas mais antigas (nunca volta para as fixadas)', () => {
    const unpinned = { ...cursor, pinned: false };
    expect(afterCursor(unpinned)).toEqual({
      OR: [
        { pinned: false, updatedAt: { lt: cursor.updatedAt } },
        { pinned: false, updatedAt: cursor.updatedAt, id: { lt: id } },
      ],
    });
  });
});
