import {
  authResponseSchema,
  userSchema,
  type AuthResponse,
  type LoginInput,
  type RegisterInput,
  type UpdateProfileInput,
  type User,
} from '@lifexp/shared';
import { apiFetch, apiJson, refreshSession, setAccessToken } from '../../lib/apiClient';

export async function register(input: Omit<RegisterInput, 'timezone'> & { timezone?: string }) {
  const result = await apiJson('/auth/register', authResponseSchema, {
    method: 'POST',
    json: input,
  });
  setAccessToken(result.accessToken);
  return result.user;
}

export async function login(input: LoginInput): Promise<User> {
  const result = await apiJson('/auth/login', authResponseSchema, {
    method: 'POST',
    json: input,
  });
  setAccessToken(result.accessToken);
  return result.user;
}

/** Recupera a sessão pelo cookie de refresh (usado ao abrir/recarregar o app). */
export async function restoreSession(): Promise<User> {
  const result: AuthResponse = await refreshSession();
  return result.user;
}

export async function logout(): Promise<void> {
  try {
    await apiFetch('/auth/logout', { method: 'POST' });
  } finally {
    setAccessToken(null);
  }
}

export function fetchMe(): Promise<User> {
  return apiJson('/users/me', userSchema);
}

export function updateProfile(input: UpdateProfileInput): Promise<User> {
  return apiJson('/users/me', userSchema, { method: 'PATCH', json: input });
}
