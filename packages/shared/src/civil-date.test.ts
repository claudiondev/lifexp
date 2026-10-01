import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  compareCivil,
  endsSameDay,
  firstOccurrenceOnOrAfter,
  isValidCivilDate,
  isValidTimeOfDay,
  isWeekStart,
  localDateTimeToUtc,
  minutesToTime,
  timeToMinutes,
  todayIn,
  weekDates,
  weekdayOf,
  weekStartOf,
} from './civil-date.js';

describe('validação de data civil e horário', () => {
  it('aceita datas reais e rejeita as impossíveis ou mal formatadas', () => {
    expect(isValidCivilDate('2026-10-01')).toBe(true);
    expect(isValidCivilDate('2028-02-29')).toBe(true); // ano bissexto
    expect(isValidCivilDate('2026-02-29')).toBe(false);
    expect(isValidCivilDate('2026-13-01')).toBe(false);
    expect(isValidCivilDate('2026-10-1')).toBe(false);
    expect(isValidCivilDate('01/10/2026')).toBe(false);
    expect(isValidCivilDate('2026-10-01T10:00:00Z')).toBe(false);
  });

  it('aceita horário HH:mm de 00:00 a 23:59', () => {
    expect(isValidTimeOfDay('00:00')).toBe(true);
    expect(isValidTimeOfDay('23:59')).toBe(true);
    expect(isValidTimeOfDay('24:00')).toBe(false);
    expect(isValidTimeOfDay('9:30')).toBe(false);
    expect(isValidTimeOfDay('09:60')).toBe(false);
  });
});

describe('aritmética de datas civis', () => {
  it('soma dias atravessando mês, ano e fevereiro bissexto', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
    expect(addDays('2026-10-01', 0)).toBe('2026-10-01');
  });

  it('não é afetada por horário de verão (dia de 23 ou 25 horas)', () => {
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
  });

  it('rejeita entrada inválida em vez de devolver lixo', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow();
    expect(() => addDays('amanhã', 1)).toThrow();
  });

  it('compara datas como texto ordenável', () => {
    expect(compareCivil('2026-09-30', '2026-10-01')).toBe(-1);
    expect(compareCivil('2026-10-01', '2026-10-01')).toBe(0);
    expect(compareCivil('2027-01-01', '2026-12-31')).toBe(1);
  });
});

describe('semana (começa na segunda, ISO 8601)', () => {
  it('identifica o dia da semana ISO (segunda = 1 ... domingo = 7)', () => {
    expect(weekdayOf('2026-10-01')).toBe(4); // quinta
    expect(weekdayOf('2026-10-05')).toBe(1); // segunda
    expect(weekdayOf('2026-10-04')).toBe(7); // domingo
  });

  it('acha o início da semana, inclusive na virada de mês e de ano', () => {
    expect(weekStartOf('2026-10-01')).toBe('2026-09-28');
    expect(weekStartOf('2026-09-28')).toBe('2026-09-28'); // segunda é o próprio início
    expect(weekStartOf('2026-10-04')).toBe('2026-09-28'); // domingo ainda é da semana anterior
    expect(weekStartOf('2026-10-05')).toBe('2026-10-05');
    expect(weekStartOf('2024-12-31')).toBe('2024-12-30');
    expect(weekStartOf('2027-01-03')).toBe('2026-12-28');
  });

  it('só considera início de semana a segunda-feira', () => {
    expect(isWeekStart('2026-09-28')).toBe(true);
    expect(isWeekStart('2026-09-29')).toBe(false);
    expect(isWeekStart('2026-10-04')).toBe(false);
  });

  it('lista os 7 dias da semana em ordem', () => {
    expect(weekDates('2026-09-28')).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
  });
});

describe('todayIn (a data civil depende do fuso)', () => {
  const now = DateTime.fromISO('2026-10-01T02:30:00Z');

  it('devolve o dia local, que pode diferir do dia em UTC', () => {
    expect(todayIn('America/Sao_Paulo', now)).toBe('2026-09-30'); // 23:30 do dia anterior
    expect(todayIn('Asia/Tokyo', now)).toBe('2026-10-01');
    expect(todayIn('UTC', now)).toBe('2026-10-01');
  });

  it('rejeita fuso inexistente', () => {
    expect(() => todayIn('Marte/Olympus', now)).toThrow();
  });

  it('aceita um Date comum e dá o mesmo resultado que o DateTime', () => {
    const instant = new Date('2026-10-01T02:30:00.000Z');
    expect(todayIn('America/Sao_Paulo', instant)).toBe('2026-09-30');
    expect(todayIn('Asia/Tokyo', instant)).toBe('2026-10-01');
    expect(todayIn('Pacific/Kiritimati', instant)).toBe('2026-10-01');
    expect(todayIn('America/Sao_Paulo', instant)).toBe(todayIn('America/Sao_Paulo', now));
  });

  it('a virada do dia acontece exatamente à meia-noite local', () => {
    // São Paulo (UTC-3): 02:59:59.999Z ainda é 23:59:59.999 do dia anterior; 03:00Z já é o dia novo
    expect(todayIn('America/Sao_Paulo', new Date('2026-10-07T02:59:59.999Z'))).toBe('2026-10-06');
    expect(todayIn('America/Sao_Paulo', new Date('2026-10-07T03:00:00.000Z'))).toBe('2026-10-07');
  });
});

describe('horário do dia', () => {
  it('converte entre HH:mm e minutos', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('09:30')).toBe(570);
    expect(timeToMinutes('23:59')).toBe(1439);
    expect(minutesToTime(570)).toBe('09:30');
    expect(minutesToTime(0)).toBe('00:00');
  });

  it('só aceita bloco que termina no mesmo dia (limite exato em 24:00)', () => {
    expect(endsSameDay('23:00', 60)).toBe(true); // termina exatamente à meia-noite
    expect(endsSameDay('23:00', 65)).toBe(false);
    expect(endsSameDay('00:00', 720)).toBe(true);
    expect(endsSameDay('22:00', 180)).toBe(false);
  });
});

describe('localDateTimeToUtc (hora de relógio -> instante)', () => {
  it('converte conforme o fuso da pessoa', () => {
    expect(localDateTimeToUtc('2026-10-01', '09:00', 'America/Sao_Paulo').toISOString()).toBe(
      '2026-10-01T12:00:00.000Z',
    );
    expect(localDateTimeToUtc('2026-10-01', '09:00', 'Asia/Tokyo').toISOString()).toBe(
      '2026-10-01T00:00:00.000Z',
    );
  });

  it('mantém o mesmo horário local ao trocar de fuso, mudando o instante (RN37)', () => {
    const sp = localDateTimeToUtc('2026-10-01', '09:00', 'America/Sao_Paulo');
    const tokyo = localDateTimeToUtc('2026-10-01', '09:00', 'Asia/Tokyo');
    expect(sp.getTime()).not.toBe(tokyo.getTime());
    expect(DateTime.fromJSDate(sp).setZone('America/Sao_Paulo').toFormat('HH:mm')).toBe('09:00');
    expect(DateTime.fromJSDate(tokyo).setZone('Asia/Tokyo').toFormat('HH:mm')).toBe('09:00');
  });

  it('hora que não existe (início do horário de verão) avança para a hora válida', () => {
    // Em 2026-03-08, em Nova York, os relógios pulam de 02:00 para 03:00.
    expect(localDateTimeToUtc('2026-03-08', '02:30', 'America/New_York').toISOString()).toBe(
      '2026-03-08T07:30:00.000Z', // 03:30 EDT
    );
  });

  it('hora repetida (fim do horário de verão) usa a primeira ocorrência', () => {
    // Em 2026-11-01, em Nova York, 01:30 acontece duas vezes.
    expect(localDateTimeToUtc('2026-11-01', '01:30', 'America/New_York').toISOString()).toBe(
      '2026-11-01T05:30:00.000Z', // primeira vez, ainda EDT
    );
  });

  it('rejeita fuso inválido', () => {
    expect(() => localDateTimeToUtc('2026-10-01', '09:00', 'Marte/Olympus')).toThrow();
  });
});

describe('firstOccurrenceOnOrAfter', () => {
  it('acha a primeira data no dia da semana pedido, em ou depois da data', () => {
    expect(firstOccurrenceOnOrAfter('2026-10-07', 3)).toBe('2026-10-07'); // já é quarta
    expect(firstOccurrenceOnOrAfter('2026-10-08', 3)).toBe('2026-10-14');
    expect(firstOccurrenceOnOrAfter('2026-10-07', 1)).toBe('2026-10-12'); // próxima segunda
    expect(firstOccurrenceOnOrAfter('2026-10-07', 7)).toBe('2026-10-11');
  });

  it('atravessa a virada de mês e de ano', () => {
    expect(firstOccurrenceOnOrAfter('2026-12-30', 5)).toBe('2027-01-01');
    expect(firstOccurrenceOnOrAfter('2026-10-30', 2)).toBe('2026-11-03');
  });

  it('nunca devolve uma data anterior à pedida, para qualquer dia da semana', () => {
    for (let weekday = 1; weekday <= 7; weekday++) {
      const result = firstOccurrenceOnOrAfter('2026-10-07', weekday);
      expect(result >= '2026-10-07').toBe(true);
      expect(result <= '2026-10-13').toBe(true);
    }
  });
});
