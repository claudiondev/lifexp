import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { LoginInput, RegisterInput, UpdateProfileInput } from '@lifexp/shared';
import { setAccessToken, setSessionExpiredHandler } from '../../lib/apiClient';
import * as authApi from './authApi';
import { AuthContext, type AuthContextValue, type AuthState } from './AuthContext';

function browserTimezone(): string | undefined {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const queryClient = useQueryClient();

  // Ao abrir o app, tenta recuperar a sessão pelo cookie de refresh. O refresh é single-flight,
  // então o double-effect do StrictMode em dev não gasta o token duas vezes.
  useEffect(() => {
    let cancelled = false;
    authApi
      .restoreSession()
      .then((user) => !cancelled && setState({ status: 'authenticated', user }))
      .catch(() => !cancelled && setState({ status: 'anonymous' }));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      // Sessão perdida: nada do usuário anterior pode ficar em memória.
      queryClient.clear();
      setState({ status: 'anonymous' });
    });
    return () => setSessionExpiredHandler(null);
  }, [queryClient]);

  const login = useCallback(
    async (input: LoginInput) => {
      const user = await authApi.login(input);
      queryClient.clear(); // garante que dados em cache de outra conta não sejam reaproveitados
      setState({ status: 'authenticated', user });
    },
    [queryClient],
  );

  const register = useCallback(
    async (input: Omit<RegisterInput, 'timezone'>) => {
      const timezone = browserTimezone();
      const user = await authApi.register({ ...input, ...(timezone && { timezone }) });
      queryClient.clear();
      setState({ status: 'authenticated', user });
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setAccessToken(null);
      queryClient.clear();
      setState({ status: 'anonymous' });
    }
  }, [queryClient]);

  const updateProfile = useCallback(async (input: UpdateProfileInput) => {
    const user = await authApi.updateProfile(input);
    setState({ status: 'authenticated', user });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ state, login, register, logout, updateProfile }),
    [state, login, register, logout, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
