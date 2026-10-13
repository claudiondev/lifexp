import { describe, expect, it } from 'vitest';
import {
  LEISURE_ICONS,
  LEISURE_NAME_MAX,
  createLeisureOptionSchema,
  leisurePercentSchema,
  leisureSessionSchema,
  startLeisureSessionSchema,
  updateLeisureOptionSchema,
} from './leisure.schema.js';

const areaId = '0192b3f4-0000-7000-8000-000000000001';

describe('leisurePercentSchema', () => {
  it.each([25, 50, 100])('aceita %i', (value) => {
    expect(leisurePercentSchema.safeParse(value).success).toBe(true);
  });
  it.each([0, 10, 75, 101, '50', null])('recusa %s', (value) => {
    expect(leisurePercentSchema.safeParse(value).success).toBe(false);
  });
});

describe('createLeisureOptionSchema', () => {
  it('apara o nome e aceita todos os ícones', () => {
    for (const icon of LEISURE_ICONS) {
      const parsed = createLeisureOptionSchema.parse({ name: '  Instagram ', icon });
      expect(parsed.name).toBe('Instagram');
    }
  });
  it('recusa nome vazio, nome longo, ícone desconhecido e campo extra', () => {
    expect(createLeisureOptionSchema.safeParse({ name: '   ', icon: 'tv' }).success).toBe(false);
    expect(
      createLeisureOptionSchema.safeParse({ name: 'a'.repeat(LEISURE_NAME_MAX + 1), icon: 'tv' })
        .success,
    ).toBe(false);
    expect(createLeisureOptionSchema.safeParse({ name: 'TV', icon: 'foguete' }).success).toBe(
      false,
    );
    expect(
      createLeisureOptionSchema.safeParse({ name: 'TV', icon: 'tv', userId: 'x' }).success,
    ).toBe(false);
  });
});

describe('updateLeisureOptionSchema', () => {
  it('exige ao menos um campo e aceita arquivar', () => {
    expect(updateLeisureOptionSchema.safeParse({}).success).toBe(false);
    expect(updateLeisureOptionSchema.safeParse({ archived: true }).success).toBe(true);
    expect(updateLeisureOptionSchema.safeParse({ archived: 'sim' }).success).toBe(false);
  });
});

describe('startLeisureSessionSchema', () => {
  it('exige um uuid e recusa campo extra', () => {
    expect(startLeisureSessionSchema.safeParse({ optionId: areaId }).success).toBe(true);
    expect(startLeisureSessionSchema.safeParse({ optionId: 'x' }).success).toBe(false);
    expect(startLeisureSessionSchema.safeParse({ optionId: areaId, limitMin: 999 }).success).toBe(
      false,
    );
  });
});

describe('leisureSessionSchema', () => {
  it('recusa limite zero', () => {
    const base = {
      id: areaId,
      optionId: areaId,
      startedAt: '2026-10-12T10:00:00.000Z',
      limitMin: 30,
      stoppedAt: null,
      endsAt: '2026-10-12T10:30:00.000Z',
      usedMin: 0,
      active: true,
    };
    expect(leisureSessionSchema.safeParse(base).success).toBe(true);
    expect(leisureSessionSchema.safeParse({ ...base, limitMin: 0 }).success).toBe(false);
  });
});
