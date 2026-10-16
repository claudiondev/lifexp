import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_GRID_DENSITY,
  GRID_DENSITIES,
  loadGridDensity,
  parseGridDensity,
  saveGridDensity,
} from './gridDensity';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('parseGridDensity', () => {
  it.each(Object.keys(GRID_DENSITIES))('aceita "%s"', (key) => {
    expect(parseGridDensity(key)).toBe(key);
  });

  it.each([null, undefined, '', 'gigante', 'toString', 'constructor', 42])(
    'valor inválido (%s) volta ao padrão',
    (raw) => {
      expect(parseGridDensity(raw)).toBe(DEFAULT_GRID_DENSITY);
    },
  );

  it('o padrão mantém 48 px por hora (a conta do arrastar depende disso)', () => {
    expect(GRID_DENSITIES[DEFAULT_GRID_DENSITY].hourPx).toBe(48);
  });

  it('quanto mais confortável, mais altura por hora', () => {
    expect(GRID_DENSITIES.compact.hourPx).toBeLessThan(GRID_DENSITIES.normal.hourPx);
    expect(GRID_DENSITIES.normal.hourPx).toBeLessThan(GRID_DENSITIES.comfortable.hourPx);
  });
});

describe('loadGridDensity / saveGridDensity', () => {
  it('guarda e lê a escolha', () => {
    saveGridDensity('comfortable');
    expect(loadGridDensity()).toBe('comfortable');
  });

  it('sem nada guardado, usa o padrão', () => {
    expect(loadGridDensity()).toBe(DEFAULT_GRID_DENSITY);
  });

  it('lixo guardado vira o padrão', () => {
    window.localStorage.setItem('lifexp:grid-density', 'lixo');
    expect(loadGridDensity()).toBe(DEFAULT_GRID_DENSITY);
  });

  it('armazenamento que lança não derruba a leitura nem a gravação', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(loadGridDensity()).toBe(DEFAULT_GRID_DENSITY);
    expect(() => saveGridDensity('compact')).not.toThrow();
  });
});
