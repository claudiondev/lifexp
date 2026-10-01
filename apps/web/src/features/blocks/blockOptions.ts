import { BLOCK_DURATION_MAX, BLOCK_DURATION_MIN, BLOCK_DURATION_STEP } from '@lifexp/shared';

/** 1 -> segunda ... 7 -> domingo (ISO). */
export const WEEKDAY_OPTIONS = [
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
] as const;

/** "45 min", "1 h", "1 h 30 min". */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** Durações mais comuns; todas válidas para a API (15 min a 12 h, em passos de 5). */
export const DURATION_OPTIONS = [
  15, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300, 360, 480, 600, 720,
].map((value) => ({ value, label: formatDuration(value) }));

// Garante, em tempo de build/teste, que as opções não saem da faixa aceita pela API.
export const DURATION_RANGE = {
  min: BLOCK_DURATION_MIN,
  max: BLOCK_DURATION_MAX,
  step: BLOCK_DURATION_STEP,
};
