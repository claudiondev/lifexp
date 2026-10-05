import { z } from 'zod';
import { isValidCivilDate, isValidTimeOfDay, isWeekStart } from './civil-date.js';

export const BLOCK_DURATION_MIN = 15;
export const BLOCK_DURATION_MAX = 720;
export const BLOCK_DURATION_STEP = 5;
export const BLOCK_NOTE_MAX = 500;

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

/**
 * Anotação livre do bloco (texto puro, nunca markdown). Sem espaços nas pontas; vazia vira nula, então "sem
 * anotação" tem uma só forma. O limite é checado depois do `trim`.
 */
export const blockNoteSchema = z
  .string()
  .trim()
  .max(BLOCK_NOTE_MAX, `A anotação pode ter no máximo ${BLOCK_NOTE_MAX} caracteres`)
  .transform((note) => (note === '' ? null : note));

/**
 * Data civil que é uma segunda-feira (início da semana). O refinamento só olha o dia da semana quando a data
 * é válida: refinamentos do Zod 4 rodam mesmo depois de outro ter falhado, e `isWeekStart` LANÇA erro com
 * uma data inexistente (então `safeParse` explodiria em vez de devolver o erro de validação).
 */
export const weekStartSchema = civilDateSchema.refine(
  (date) => !isValidCivilDate(date) || isWeekStart(date),
  'A semana começa na segunda-feira',
);
