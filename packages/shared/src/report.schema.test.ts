import { describe, expect, it } from 'vitest';
import { reportAreaSchema, reportBlocksSchema, weeklyReportQuerySchema } from './report.schema.js';

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

describe('reportBlocksSchema', () => {
  const blocks = { planned: 10, completed: 8, skipped: 1, open: 2, adherence: 80 };

  it('aceita os números da semana e aderência nula sem blocos contados', () => {
    expect(ok(reportBlocksSchema, blocks)).toBe(true);
    expect(ok(reportBlocksSchema, { ...blocks, planned: 0, completed: 0, adherence: null })).toBe(
      true,
    );
  });

  it('recusa negativos, fracionados e aderência fora de 0 a 100', () => {
    expect(ok(reportBlocksSchema, { ...blocks, planned: -1 })).toBe(false);
    expect(ok(reportBlocksSchema, { ...blocks, completed: 1.5 })).toBe(false);
    expect(ok(reportBlocksSchema, { ...blocks, adherence: 101 })).toBe(false);
  });
});

describe('reportAreaSchema', () => {
  const area = {
    areaId: '0192f1a0-7b3c-7000-8000-0000000000a1',
    name: 'Saúde',
    color: 'moss',
    icon: 'heart-pulse',
    planned: 4,
    completed: 3,
    score: 75,
    minutes: 180,
  };

  it('aceita área com nota e área sem blocos (nota nula)', () => {
    expect(ok(reportAreaSchema, area)).toBe(true);
    expect(ok(reportAreaSchema, { ...area, planned: 0, completed: 0, score: null })).toBe(true);
  });

  it('recusa cor ou ícone fora do catálogo', () => {
    expect(ok(reportAreaSchema, { ...area, color: 'neon' })).toBe(false);
    expect(ok(reportAreaSchema, { ...area, icon: 'x' })).toBe(false);
  });
});

describe('weeklyReportQuerySchema', () => {
  it('a semana é opcional, mas tem que ser uma segunda-feira válida', () => {
    expect(ok(weeklyReportQuerySchema, {})).toBe(true);
    expect(ok(weeklyReportQuerySchema, { weekStart: '2026-10-05' })).toBe(true);
    expect(ok(weeklyReportQuerySchema, { weekStart: '2026-10-06' })).toBe(false);
    expect(ok(weeklyReportQuerySchema, { weekStart: '2026-02-30' })).toBe(false);
  });
});
