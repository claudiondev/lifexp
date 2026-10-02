import type { AppNotification } from '@lifexp/shared';
import { describe, expect, it } from 'vitest';
import { badgeText, leadLabel, notificationTarget, relativeTime } from './notificationFormat';

const base: AppNotification = {
  id: '0192f1a0-7b3c-7000-8000-0000000000a1',
  kind: 'digest',
  title: 't',
  body: 'b',
  scheduledFor: '2026-10-07T10:00:00.000Z',
  createdAt: '2026-10-07T10:00:01.000Z',
  readAt: null,
  blockId: null,
  occurrenceDate: null,
  eventId: null,
};

describe('notificationTarget', () => {
  it('bloco leva à semana da data original; evento ao calendário; resumo a Hoje', () => {
    expect(
      notificationTarget({
        ...base,
        kind: 'block',
        blockId: base.id,
        occurrenceDate: '2026-10-14',
      }),
    ).toBe('/semana?inicio=2026-10-14');
    expect(notificationTarget({ ...base, kind: 'event', eventId: base.id })).toBe('/calendario');
    expect(notificationTarget(base)).toBe('/hoje');
  });

  it('o aviso do relatório semanal leva à Revisão', () => {
    expect(notificationTarget({ ...base, kind: 'report' })).toBe('/revisao');
  });

  it('bloco sem data (dado incompleto) cai em Hoje, nunca num link quebrado', () => {
    expect(notificationTarget({ ...base, kind: 'block', blockId: base.id })).toBe('/hoje');
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-10-07T12:00:00.000Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it('escolhe a unidade pela idade', () => {
    expect(relativeTime(ago(0), now)).toBe('agora');
    expect(relativeTime(ago(59_000), now)).toBe('agora');
    expect(relativeTime(ago(60_000), now)).toBe('há 1 min');
    expect(relativeTime(ago(59 * 60_000), now)).toBe('há 59 min');
    expect(relativeTime(ago(60 * 60_000), now)).toBe('há 1 h');
    expect(relativeTime(ago(23 * 3_600_000), now)).toBe('há 23 h');
    expect(relativeTime(ago(24 * 3_600_000), now)).toBe('há 1 dia');
    expect(relativeTime(ago(72 * 3_600_000), now)).toBe('há 3 dias');
  });

  it('data no futuro (relógio adiantado) vira "agora", nunca negativo', () => {
    expect(relativeTime(new Date(now.getTime() + 5 * 60_000).toISOString(), now)).toBe('agora');
  });
});

describe('badgeText', () => {
  it('some em zero, mostra o número e para em 99+', () => {
    expect(badgeText(0)).toBeNull();
    expect(badgeText(-1)).toBeNull();
    expect(badgeText(1)).toBe('1');
    expect(badgeText(99)).toBe('99');
    expect(badgeText(100)).toBe('99+');
  });
});

describe('leadLabel', () => {
  it('minutos e 1 hora', () => {
    expect(leadLabel(5)).toBe('5 minutos antes');
    expect(leadLabel(15)).toBe('15 minutos antes');
    expect(leadLabel(30)).toBe('30 minutos antes');
    expect(leadLabel(60)).toBe('1 hora antes');
  });
});
