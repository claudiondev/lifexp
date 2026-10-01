import { describe, expect, it } from 'vitest';
import {
  createActivitySchema,
  listActivitiesQuerySchema,
  updateActivitySchema,
} from './activity.schema.js';
import { createAreaSchema, listAreasQuerySchema, updateAreaSchema } from './area.schema.js';
import { updateProfileSchema } from './profile.schema.js';

const areaId = '0192f1a0-7b3c-7000-8000-000000000001';

describe('createAreaSchema', () => {
  it('aceita área válida e normaliza o nome', () => {
    const parsed = createAreaSchema.parse({ name: '  Fé ', color: 'gold', icon: 'church' });
    expect(parsed.name).toBe('Fé');
  });

  it('rejeita cor e ícone fora da lista e nome vazio', () => {
    expect(createAreaSchema.safeParse({ name: 'X', color: 'neon', icon: 'church' }).success).toBe(
      false,
    );
    expect(
      createAreaSchema.safeParse({ name: 'X', color: 'gold', icon: 'inexistente' }).success,
    ).toBe(false);
    expect(createAreaSchema.safeParse({ name: '   ', color: 'gold', icon: 'church' }).success).toBe(
      false,
    );
  });
});

describe('updates parciais', () => {
  it('exigem ao menos um campo', () => {
    expect(updateAreaSchema.safeParse({}).success).toBe(false);
    expect(updateActivitySchema.safeParse({}).success).toBe(false);
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
  });

  it('aceitam um único campo válido', () => {
    expect(updateAreaSchema.safeParse({ color: 'moss' }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ timezone: 'America/Sao_Paulo' }).success).toBe(true);
  });

  it('rejeitam fuso inválido e emblema desconhecido no perfil', () => {
    expect(updateProfileSchema.safeParse({ timezone: 'Marte/Olympus' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ avatarKey: 'dragao' }).success).toBe(false);
  });
});

describe('createActivitySchema (RN02)', () => {
  it('usa peso 1,0 por padrão', () => {
    expect(createActivitySchema.parse({ areaId, name: 'Leitura' }).xpWeight).toBe(1);
  });

  it('limita o peso entre 0,5 e 2,0, inclusive nas pontas', () => {
    const make = (xpWeight: number) =>
      createActivitySchema.safeParse({ areaId, name: 'X', xpWeight });
    expect(make(0.5).success).toBe(true);
    expect(make(2).success).toBe(true);
    expect(make(0.49).success).toBe(false);
    expect(make(2.01).success).toBe(false);
  });
});

describe('filtros de listagem', () => {
  it('convertem includeArchived de texto para booleano, padrão false', () => {
    expect(listAreasQuerySchema.parse({}).includeArchived).toBe(false);
    expect(listAreasQuerySchema.parse({ includeArchived: 'true' }).includeArchived).toBe(true);
    expect(listAreasQuerySchema.safeParse({ includeArchived: 'talvez' }).success).toBe(false);
  });

  it('areaId é opcional e precisa ser UUID', () => {
    expect(listActivitiesQuerySchema.safeParse({}).success).toBe(true);
    expect(listActivitiesQuerySchema.safeParse({ areaId: 'abc' }).success).toBe(false);
  });
});
