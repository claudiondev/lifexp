import {
  checkCanComplete,
  checkCanUndo,
  completionWindow,
  dayBounds,
  occurrenceStatus,
  windowPhase,
} from './completion-window.js';

const at = (iso: string) => new Date(iso);
const iso = (date: Date) => date.toISOString();

describe('completionWindow (RN08): do início do bloco até 23:59 do dia seguinte', () => {
  it('em São Paulo (UTC-3)', () => {
    const w = completionWindow('2026-10-07', '09:00', 'America/Sao_Paulo');
    expect(iso(w.opensAt)).toBe('2026-10-07T12:00:00.000Z');
    expect(iso(w.closesAt)).toBe('2026-10-09T02:59:59.999Z'); // 23:59:59.999 de 08/10 em SP
  });

  it('em Tóquio (UTC+9, sem horário de verão)', () => {
    const w = completionWindow('2026-10-07', '09:00', 'Asia/Tokyo');
    expect(iso(w.opensAt)).toBe('2026-10-07T00:00:00.000Z');
    expect(iso(w.closesAt)).toBe('2026-10-08T14:59:59.999Z');
  });

  it('em Los Angeles (UTC-7 em outubro)', () => {
    const w = completionWindow('2026-10-07', '09:00', 'America/Los_Angeles');
    expect(iso(w.opensAt)).toBe('2026-10-07T16:00:00.000Z');
    expect(iso(w.closesAt)).toBe('2026-10-09T06:59:59.999Z');
  });

  it('no fuso mais adiantado do mundo (Kiritimati, UTC+14) o dia civil local manda, não o UTC', () => {
    const w = completionWindow('2026-10-07', '09:00', 'Pacific/Kiritimati');
    expect(iso(w.opensAt)).toBe('2026-10-06T19:00:00.000Z'); // ainda dia 6 em UTC
    expect(iso(w.closesAt)).toBe('2026-10-08T09:59:59.999Z');
  });

  it('o mesmo bloco vale instantes diferentes em fusos diferentes (horário local preservado, RN37)', () => {
    const sp = completionWindow('2026-10-07', '09:00', 'America/Sao_Paulo');
    const tokyo = completionWindow('2026-10-07', '09:00', 'Asia/Tokyo');
    expect(sp.opensAt.getTime()).not.toBe(tokyo.opensAt.getTime());
  });

  it('a duração da janela é o resto do dia do bloco mais o dia seguinte inteiro', () => {
    // bloco às 09:00: 15 h até a meia-noite + 24 h do dia seguinte - 1 ms
    const w = completionWindow('2026-10-07', '09:00', 'America/Sao_Paulo');
    expect(w.closesAt.getTime() - w.opensAt.getTime()).toBe((15 + 24) * 3_600_000 - 1);
  });

  it('um bloco à meia-noite tem a janela mais longa (quase 48 h)', () => {
    const w = completionWindow('2026-10-07', '00:00', 'America/Sao_Paulo');
    expect(w.closesAt.getTime() - w.opensAt.getTime()).toBe(48 * 3_600_000 - 1);
  });

  it('um bloco às 23:00 termina junto com o dia seguinte, 24 h + 1 h depois', () => {
    const w = completionWindow('2026-10-07', '23:00', 'America/Sao_Paulo');
    expect(w.closesAt.getTime() - w.opensAt.getTime()).toBe(25 * 3_600_000 - 1);
  });

  describe('horário de verão', () => {
    it('início do horário de verão: o dia 08/03/2026 em Nova York tem 23 h e o fim da janela acerta o relógio local', () => {
      // bloco de 07/03 às 21:00 EST: a janela vai até o fim de 08/03 (dia de 23 h)
      const w = completionWindow('2026-03-07', '21:00', 'America/New_York');
      expect(iso(w.opensAt)).toBe('2026-03-08T02:00:00.000Z'); // 21:00 EST (UTC-5)
      expect(iso(w.closesAt)).toBe('2026-03-09T03:59:59.999Z'); // 23:59:59.999 EDT (UTC-4)
      // 3 h até a meia-noite de 07/03 + 23 h do dia curto de 08/03 = 26 h (menos 1 ms)
      expect(w.closesAt.getTime() - w.opensAt.getTime()).toBe(26 * 3_600_000 - 1);
    });

    it('fim do horário de verão: o dia 01/11/2026 em Nova York tem 25 h', () => {
      const w = completionWindow('2026-10-31', '21:00', 'America/New_York');
      expect(iso(w.opensAt)).toBe('2026-11-01T01:00:00.000Z'); // 21:00 EDT (UTC-4)
      expect(iso(w.closesAt)).toBe('2026-11-02T04:59:59.999Z'); // 23:59:59.999 EST (UTC-5)
      // 3 h até a meia-noite de 31/10 + 25 h do dia longo de 01/11 = 28 h (menos 1 ms)
      expect(w.closesAt.getTime() - w.opensAt.getTime()).toBe(28 * 3_600_000 - 1);
    });

    it('bloco em hora que não existe (02:30 no salto) abre na hora válida seguinte', () => {
      const w = completionWindow('2026-03-08', '02:30', 'America/New_York');
      expect(iso(w.opensAt)).toBe('2026-03-08T07:30:00.000Z'); // 03:30 EDT
    });
  });
});

describe('windowPhase: nos limites exatos', () => {
  const window = completionWindow('2026-10-07', '09:00', 'America/Sao_Paulo');

  it('antes do início: ainda não começou (RN10)', () => {
    expect(windowPhase(at('2026-10-07T11:59:59.999Z'), window)).toBe('upcoming');
    expect(windowPhase(at('2026-10-01T00:00:00.000Z'), window)).toBe('upcoming');
  });

  it('no instante exato do início a janela já está aberta', () => {
    expect(windowPhase(at('2026-10-07T12:00:00.000Z'), window)).toBe('open');
  });

  it('aberta durante o resto do dia e o dia seguinte inteiro', () => {
    expect(windowPhase(at('2026-10-07T20:00:00.000Z'), window)).toBe('open');
    expect(windowPhase(at('2026-10-08T12:00:00.000Z'), window)).toBe('open');
  });

  it('às 23:59:59.999 do dia seguinte ainda está aberta; um milissegundo depois, fechou', () => {
    expect(windowPhase(at('2026-10-09T02:59:59.999Z'), window)).toBe('open');
    expect(windowPhase(at('2026-10-09T03:00:00.000Z'), window)).toBe('closed');
  });

  it('muito depois, segue fechada', () => {
    expect(windowPhase(at('2027-10-07T12:00:00.000Z'), window)).toBe('closed');
  });
});

describe('occurrenceStatus', () => {
  const window = completionWindow('2026-10-07', '09:00', 'America/Sao_Paulo');
  const before = at('2026-10-07T10:00:00.000Z');
  const during = at('2026-10-07T13:00:00.000Z');
  const after = at('2026-10-10T00:00:00.000Z');
  const status = (skipped: boolean, completed: boolean, now: Date) =>
    occurrenceStatus({ skipped, completed, now, window });

  it('sem conclusão nem pulo, segue a janela', () => {
    expect(status(false, false, before)).toBe('upcoming');
    expect(status(false, false, during)).toBe('open');
    expect(status(false, false, after)).toBe('closed');
  });

  it('concluída continua concluída, antes, durante ou depois da janela', () => {
    expect(status(false, true, before)).toBe('completed');
    expect(status(false, true, during)).toBe('completed');
    expect(status(false, true, after)).toBe('completed');
  });

  it('pulada é "skipped" em qualquer momento', () => {
    expect(status(true, false, before)).toBe('skipped');
    expect(status(true, false, during)).toBe('skipped');
    expect(status(true, false, after)).toBe('skipped');
  });

  it('se por algum motivo estiver concluída e pulada, a conclusão vence (o XP já foi dado)', () => {
    expect(status(true, true, during)).toBe('completed');
  });
});

describe('checkCanComplete (RN07, RN10, RN11)', () => {
  const window = completionWindow('2026-10-07', '09:00', 'America/Sao_Paulo');

  it('pode concluir durante a janela', () => {
    expect(
      checkCanComplete({ skipped: false, now: at('2026-10-07T13:00:00.000Z'), window }),
    ).toEqual({ ok: true });
  });

  it('pode concluir no dia seguinte, até o último instante', () => {
    expect(
      checkCanComplete({ skipped: false, now: at('2026-10-09T02:59:59.999Z'), window }),
    ).toEqual({ ok: true });
  });

  it('bloco futuro não pode ser concluído', () => {
    expect(
      checkCanComplete({ skipped: false, now: at('2026-10-07T11:59:59.999Z'), window }),
    ).toEqual({
      ok: false,
      reason: 'not_started',
    });
  });

  it('depois da janela não pode mais', () => {
    expect(
      checkCanComplete({ skipped: false, now: at('2026-10-09T03:00:00.000Z'), window }),
    ).toEqual({
      ok: false,
      reason: 'window_closed',
    });
  });

  it('ocorrência pulada não conclui, mesmo com a janela aberta', () => {
    expect(
      checkCanComplete({ skipped: true, now: at('2026-10-07T13:00:00.000Z'), window }),
    ).toEqual({
      ok: false,
      reason: 'skipped',
    });
  });

  it('pulada tem prioridade sobre o motivo de tempo', () => {
    expect(
      checkCanComplete({ skipped: true, now: at('2026-10-01T00:00:00.000Z'), window }),
    ).toEqual({
      ok: false,
      reason: 'skipped',
    });
  });
});

describe('checkCanUndo (RN09): só dentro da mesma janela', () => {
  const window = completionWindow('2026-10-07', '09:00', 'America/Sao_Paulo');

  it('pode desfazer enquanto a janela está aberta, inclusive no último instante', () => {
    expect(checkCanUndo({ now: at('2026-10-07T13:00:00.000Z'), window })).toEqual({ ok: true });
    expect(checkCanUndo({ now: at('2026-10-09T02:59:59.999Z'), window })).toEqual({ ok: true });
  });

  it('depois que a janela fecha, a conclusão é definitiva', () => {
    expect(checkCanUndo({ now: at('2026-10-09T03:00:00.000Z'), window })).toEqual({
      ok: false,
      reason: 'window_closed',
    });
  });
});

describe('dayBounds: o dia local de quem usa o app', () => {
  it('em São Paulo, o dia 07/10 começa às 03:00 UTC e termina às 03:00 UTC do dia seguinte', () => {
    const { startsAt, endsAt } = dayBounds('2026-10-07', 'America/Sao_Paulo');
    expect(iso(startsAt)).toBe('2026-10-07T03:00:00.000Z');
    expect(iso(endsAt)).toBe('2026-10-08T03:00:00.000Z');
  });

  it('um instante de madrugada em UTC pode pertencer ao dia anterior em São Paulo', () => {
    const { startsAt, endsAt } = dayBounds('2026-10-06', 'America/Sao_Paulo');
    const instant = at('2026-10-07T02:30:00.000Z'); // 23:30 de 06/10 em SP
    expect(instant >= startsAt && instant < endsAt).toBe(true);
  });

  it('o limite final é exclusivo: o primeiro instante do dia seguinte já é do dia seguinte', () => {
    const today = dayBounds('2026-10-07', 'America/Sao_Paulo');
    const tomorrow = dayBounds('2026-10-08', 'America/Sao_Paulo');
    expect(today.endsAt.getTime()).toBe(tomorrow.startsAt.getTime());
  });

  it('dia de 23 horas (início do horário de verão em Nova York)', () => {
    const { startsAt, endsAt } = dayBounds('2026-03-08', 'America/New_York');
    expect(iso(startsAt)).toBe('2026-03-08T05:00:00.000Z'); // EST
    expect(iso(endsAt)).toBe('2026-03-09T04:00:00.000Z'); // EDT
    expect(endsAt.getTime() - startsAt.getTime()).toBe(23 * 3_600_000);
  });

  it('dia de 25 horas (fim do horário de verão em Nova York)', () => {
    const { startsAt, endsAt } = dayBounds('2026-11-01', 'America/New_York');
    expect(iso(startsAt)).toBe('2026-11-01T04:00:00.000Z'); // EDT
    expect(iso(endsAt)).toBe('2026-11-02T05:00:00.000Z'); // EST
    expect(endsAt.getTime() - startsAt.getTime()).toBe(25 * 3_600_000);
  });

  it('dias consecutivos não deixam buracos nem se sobrepõem, em qualquer fuso', () => {
    for (const tz of [
      'America/Sao_Paulo',
      'America/New_York',
      'Asia/Tokyo',
      'Pacific/Kiritimati',
    ]) {
      // 07, 08 e 09/03/2026 incluem a mudança do horário de verão nos EUA
      const d1 = dayBounds('2026-03-07', tz);
      const d2 = dayBounds('2026-03-08', tz);
      const d3 = dayBounds('2026-03-09', tz);
      expect(d1.endsAt.getTime()).toBe(d2.startsAt.getTime());
      expect(d2.endsAt.getTime()).toBe(d3.startsAt.getTime());
    }
  });
});
