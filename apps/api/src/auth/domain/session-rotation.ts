export interface SessionSnapshot {
  revokedAt: Date | null;
  expiresAt: Date;
}

export type RotationDecision =
  | { action: 'rotate' }
  | { action: 'reject' }
  /** Token já revogado foi reapresentado: possível roubo, derruba a família toda (RS04). */
  | { action: 'revoke_family' };

export function decideRotation(session: SessionSnapshot | null, now: Date): RotationDecision {
  if (session === null) return { action: 'reject' };
  if (session.revokedAt !== null) return { action: 'revoke_family' };
  if (session.expiresAt.getTime() <= now.getTime()) return { action: 'reject' };
  return { action: 'rotate' };
}
