import { createContext } from 'react';
import type { LoginInput, RegisterInput, UpdateProfileInput, User } from '@lifexp/shared';

export type AuthState =
  { status: 'loading' } | { status: 'anonymous' } | { status: 'authenticated'; user: User };

export interface AuthContextValue {
  state: AuthState;
  login: (input: LoginInput) => Promise<void>;
  register: (input: Omit<RegisterInput, 'timezone'>) => Promise<void>;
  logout: () => Promise<void>;
  /** Salva o perfil e atualiza o usuário em memória (HUD e ficha mudam na hora). */
  updateProfile: (input: UpdateProfileInput) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
