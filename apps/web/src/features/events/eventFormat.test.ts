import { EVENT_CATEGORIES, isReminderAllowed } from '@lifexp/shared';
import { describe, expect, it } from 'vitest';
import {
  CATEGORY_LABEL,
  CATEGORY_OPTIONS,
  reminderLabel,
  reminderOptions,
  timeLabel,
} from './eventFormat';

describe('categorias', () => {
  it('toda categoria da API tem rótulo, na mesma ordem', () => {
    expect(CATEGORY_OPTIONS.map((o) => o.value)).toEqual([...EVENT_CATEGORIES]);
    for (const value of EVENT_CATEGORIES) expect(CATEGORY_LABEL[value]).toBeTruthy();
  });
});

describe('lembretes', () => {
  it('rotula cada antecedência e "sem lembrete"', () => {
    expect(reminderLabel(null)).toBe('Sem lembrete');
    expect(reminderLabel(0)).toBe('No horário');
    expect(reminderLabel(15)).toBe('15 minutos antes');
    expect(reminderLabel(60)).toBe('1 hora antes');
    expect(reminderLabel(1440)).toBe('1 dia antes');
    expect(reminderLabel(2880)).toBe('2 dias antes');
  });

  it('com hora, oferece todas as antecedências', () => {
    expect(reminderOptions(false).map((o) => o.value)).toEqual([
      'none',
      '0',
      '15',
      '60',
      '1440',
      '2880',
    ]);
  });

  it('dia todo oferece só lembretes em dias (os mesmos que a API aceita)', () => {
    const options = reminderOptions(true).map((o) => o.value);
    expect(options).toEqual(['none', '1440', '2880']);
    for (const value of options) {
      const minutes = value === 'none' ? null : Number(value);
      expect(isReminderAllowed(null, minutes)).toBe(true);
    }
  });

  it('toda opção com hora é aceita pela API', () => {
    for (const { value } of reminderOptions(false)) {
      expect(isReminderAllowed('10:00', value === 'none' ? null : Number(value))).toBe(true);
    }
  });
});

describe('timeLabel', () => {
  it('mostra a hora ou "Dia todo"', () => {
    expect(timeLabel({ time: '14:30' })).toBe('14:30');
    expect(timeLabel({ time: null })).toBe('Dia todo');
  });
});
