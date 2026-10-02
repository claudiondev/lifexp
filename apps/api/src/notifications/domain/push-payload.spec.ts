import { describe, expect, it } from 'vitest';
import { MAX_PUSH_BODY, MAX_PUSH_TITLE, pushUrl, toPushPayload } from './push-payload.js';

describe('pushUrl', () => {
  it('cada tipo leva ao mesmo lugar de abrir o aviso dentro do app', () => {
    expect(pushUrl('BLOCK', '2026-10-14')).toBe('/semana?inicio=2026-10-14');
    expect(pushUrl('EVENT', null)).toBe('/calendario');
    expect(pushUrl('DIGEST', null)).toBe('/hoje');
    expect(pushUrl('REPORT', null)).toBe('/revisao');
  });

  it('bloco sem data (dado incompleto) cai em Hoje, nunca num link quebrado', () => {
    expect(pushUrl('BLOCK', null)).toBe('/hoje');
  });

  it('é sempre um caminho do próprio app (começa com / e não com //)', () => {
    for (const url of [
      pushUrl('BLOCK', '2026-10-14'),
      pushUrl('EVENT', null),
      pushUrl('DIGEST', null),
      pushUrl('REPORT', null),
    ]) {
      expect(url.startsWith('/')).toBe(true);
      expect(url.startsWith('//')).toBe(false);
    }
  });
});

describe('toPushPayload', () => {
  const base = {
    kind: 'BLOCK' as const,
    title: 'Corrida em 15 minutos',
    body: 'Hoje, às 06:00.',
    dedupeKey: 'block:abc:2026-10-14:15',
    occurrenceDate: '2026-10-14',
  };

  it('leva título, texto, destino e a etiqueta (a chave lógica: reenviar não empilha)', () => {
    expect(toPushPayload(base)).toEqual({
      title: 'Corrida em 15 minutos',
      body: 'Hoje, às 06:00.',
      url: '/semana?inicio=2026-10-14',
      tag: 'block:abc:2026-10-14:15',
    });
  });

  it('corta título e texto longos com reticências, sem passar do limite', () => {
    const payload = toPushPayload({
      ...base,
      title: 'T'.repeat(200),
      body: 'b'.repeat(500),
    });
    expect(payload.title).toHaveLength(MAX_PUSH_TITLE);
    expect(payload.title.endsWith('…')).toBe(true);
    expect(payload.body).toHaveLength(MAX_PUSH_BODY);
    expect(payload.body.endsWith('…')).toBe(true);
  });

  it('o que cabe no limite não é cortado', () => {
    const payload = toPushPayload({
      ...base,
      title: 'T'.repeat(MAX_PUSH_TITLE),
      body: 'b'.repeat(MAX_PUSH_BODY),
    });
    expect(payload.title).toBe('T'.repeat(MAX_PUSH_TITLE));
    expect(payload.body).toBe('b'.repeat(MAX_PUSH_BODY));
  });
});
