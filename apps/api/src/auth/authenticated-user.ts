import type { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  /** A sessão (família do refresh token) que emitiu o access token. */
  sessionId: string;
}

export type AuthenticatedRequest = Request & { user?: AuthenticatedUser };
