import { decideRotation } from './session-rotation.js';

describe('decideRotation', () => {
  const now = new Date('2026-10-01T12:00:00.000Z');
  const future = new Date('2026-10-05T12:00:00.000Z');
  const past = new Date('2026-09-30T12:00:00.000Z');

  it('rotaciona sessão ativa e não expirada', () => {
    expect(decideRotation({ revokedAt: null, expiresAt: future }, now)).toEqual({
      action: 'rotate',
    });
  });

  it('rejeita token desconhecido', () => {
    expect(decideRotation(null, now)).toEqual({ action: 'reject' });
  });

  it('rejeita sessão expirada (inclusive no instante exato)', () => {
    expect(decideRotation({ revokedAt: null, expiresAt: past }, now).action).toBe('reject');
    expect(decideRotation({ revokedAt: null, expiresAt: now }, now).action).toBe('reject');
  });

  it('detecta reuso: sessão já revogada revoga a família', () => {
    expect(decideRotation({ revokedAt: past, expiresAt: future }, now)).toEqual({
      action: 'revoke_family',
    });
  });

  it('reuso tem prioridade sobre expiração', () => {
    expect(decideRotation({ revokedAt: past, expiresAt: past }, now).action).toBe('revoke_family');
  });
});
