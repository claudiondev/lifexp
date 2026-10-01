import { z } from 'zod';
import { isValidCivilDate, isValidTimeOfDay } from './civil-date.js';

export const BLOCK_DURATION_MIN = 15;
export const BLOCK_DURATION_MAX = 720;
export const BLOCK_DURATION_STEP = 5;

export const civilDateSchema = z
  .string()
  .refine(isValidCivilDate, 'Data inválida (use AAAA-MM-DD)');
export const timeOfDaySchema = z.string().refine(isValidTimeOfDay, 'Horário inválido (use HH:mm)');
export const weekdaySchema = z.number().int().min(1).max(7);
export const durationMinSchema = z
  .number()
  .int()
  .min(BLOCK_DURATION_MIN, `A duração mínima é ${BLOCK_DURATION_MIN} minutos`)
  .max(BLOCK_DURATION_MAX, `A duração máxima é ${BLOCK_DURATION_MAX / 60} horas`)
  .multipleOf(BLOCK_DURATION_STEP, `A duração deve ser múltipla de ${BLOCK_DURATION_STEP} minutos`);
