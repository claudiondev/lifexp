/** Quanto espaço cada hora ocupa na grade da semana: quem tem blocos curtos prefere "confortável". */
export const GRID_DENSITIES = {
  compact: { label: 'Compacta', hourPx: 36 },
  normal: { label: 'Padrão', hourPx: 48 },
  comfortable: { label: 'Confortável', hourPx: 72 },
} as const;

export type GridDensity = keyof typeof GRID_DENSITIES;

export const DEFAULT_GRID_DENSITY: GridDensity = 'normal';

const STORAGE_KEY = 'lifexp:grid-density';

/** Qualquer valor que não seja uma densidade conhecida (ou nulo) volta ao padrão. */
export function parseGridDensity(raw: unknown): GridDensity {
  return typeof raw === 'string' && Object.hasOwn(GRID_DENSITIES, raw)
    ? (raw as GridDensity)
    : DEFAULT_GRID_DENSITY;
}

/** Preferência só deste navegador: se o armazenamento falhar (janela privada...), usa o padrão. */
export function loadGridDensity(): GridDensity {
  try {
    return parseGridDensity(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_GRID_DENSITY;
  }
}

export function saveGridDensity(density: GridDensity): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, density);
  } catch {
    // sem armazenamento: a escolha vale só até recarregar
  }
}
