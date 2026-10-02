import { describe, expect, it } from 'vitest';
import type { SessionInfo } from '@lifexp/shared';
import { fileNameFrom } from './accountApi';
import { otherSessions, revokedMessage, startedOn } from './sessionFormat';

const session = (over: Partial<SessionInfo> = {}): SessionInfo => ({
  id: '0192f1a0-7b3c-7000-8000-0000000000a1',
  device: 'Chrome · Windows',
  createdAt: '2026-10-01T12:00:00.000Z',
  lastUsedAt: '2026-10-01T12:00:00.000Z',
  current: false,
  ...over,
});

describe('revokedMessage', () => {
  it('singular e plural', () => {
    expect(revokedMessage(1)).toBe('1 sessão encerrada');
    expect(revokedMessage(2)).toBe('2 sessões encerradas');
    expect(revokedMessage(0)).toBe('0 sessões encerradas');
  });
});

describe('startedOn', () => {
  it('usa o dia no fuso da pessoa', () => {
    const s = session({ createdAt: '2026-10-02T02:30:00.000Z' });
    expect(startedOn(s, 'America/Sao_Paulo')).toBe('1 de outubro de 2026');
    expect(startedOn(s, 'UTC')).toBe('2 de outubro de 2026');
    expect(startedOn(s, 'Pacific/Kiritimati')).toBe('2 de outubro de 2026');
  });
});

describe('otherSessions', () => {
  it('tira a atual e mantém a ordem', () => {
    const list = [session({ id: 'a', current: true }), session({ id: 'b' }), session({ id: 'c' })];
    expect(otherSessions(list).map((s) => s.id)).toEqual(['b', 'c']);
    expect(otherSessions([list[0]!])).toEqual([]);
  });
});

describe('fileNameFrom', () => {
  it('lê o nome do Content-Disposition', () => {
    expect(fileNameFrom('attachment; filename="lifexp-dados-2026-10-07.json"')).toBe(
      'lifexp-dados-2026-10-07.json',
    );
  });

  it('sem cabeçalho ou sem nome, usa o padrão', () => {
    expect(fileNameFrom(null)).toBe('lifexp-dados.json');
    expect(fileNameFrom('attachment')).toBe('lifexp-dados.json');
    expect(fileNameFrom('')).toBe('lifexp-dados.json');
  });
});
