import {
  CIVIL_DATE_FIELDS,
  EXCLUDED_FROM_EXPORT,
  EXPORT_KEYS,
  exportFileName,
  serializeRow,
} from './account-export.js';

describe('serializeRow', () => {
  it('datas civis saem como AAAA-MM-DD, sem horário nem fuso', () => {
    const row = serializeRow({
      date: new Date('2026-10-07T00:00:00.000Z'),
      validFrom: new Date('2026-10-05T00:00:00.000Z'),
      validUntil: new Date('2026-12-31T00:00:00.000Z'),
      weekStart: new Date('2026-10-05T00:00:00.000Z'),
      occurrenceDate: new Date('2026-10-07T00:00:00.000Z'),
      newDate: new Date('2026-10-08T00:00:00.000Z'),
      deadline: new Date('2027-01-01T00:00:00.000Z'),
    });
    expect(row).toEqual({
      date: '2026-10-07',
      validFrom: '2026-10-05',
      validUntil: '2026-12-31',
      weekStart: '2026-10-05',
      occurrenceDate: '2026-10-07',
      newDate: '2026-10-08',
      deadline: '2027-01-01',
    });
  });

  it('instantes saem em ISO 8601 UTC, inclusive os de colunas que não são datas civis', () => {
    expect(
      serializeRow({
        createdAt: new Date('2026-10-07T15:30:45.123Z'),
        completedAt: new Date('2026-10-07T00:00:00.000Z'), // meia-noite UTC, mas é um instante
      }),
    ).toEqual({ createdAt: '2026-10-07T15:30:45.123Z', completedAt: '2026-10-07T00:00:00.000Z' });
  });

  it('mantém nulos, números, textos e booleanos como estão', () => {
    expect(
      serializeRow({ id: 'x', amount: -60, weight: 1.5, done: false, notes: null, deadline: null }),
    ).toEqual({ id: 'x', amount: -60, weight: 1.5, done: false, notes: null, deadline: null });
  });

  it('não altera a linha original', () => {
    const original = { date: new Date('2026-10-07T00:00:00.000Z') };
    serializeRow(original);
    expect(original.date).toBeInstanceOf(Date);
  });
});

describe('modelos exportados', () => {
  it('nenhum modelo está ao mesmo tempo exportado e excluído', () => {
    const excluded = new Set(Object.keys(EXCLUDED_FROM_EXPORT));
    for (const model of Object.keys(EXPORT_KEYS)) expect(excluded.has(model)).toBe(false);
  });

  it('os nomes das listas na exportação são únicos', () => {
    const keys = Object.values(EXPORT_KEYS);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('as credenciais nunca são exportadas', () => {
    expect(Object.keys(EXCLUDED_FROM_EXPORT).sort()).toEqual(['PasswordResetToken', 'Session']);
  });

  it('as colunas de data civil são exatamente as conhecidas', () => {
    expect([...CIVIL_DATE_FIELDS].sort()).toEqual([
      'date',
      'deadline',
      'newDate',
      'occurrenceDate',
      'validFrom',
      'validUntil',
      'weekStart',
    ]);
  });
});

describe('exportFileName', () => {
  it('usa a data do pedido', () => {
    expect(exportFileName('2026-10-02')).toBe('lifexp-dados-2026-10-02.json');
  });
});
