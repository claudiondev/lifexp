import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { LoginInput, RegisterInput } from '@lifexp/shared';
import { setAccessToken, setSessionExpiredHandler } from '../../lib/apiClient';
import * as authApi from './authApi';
import { AuthContext, type AuthContextValue, type AuthState } from './AuthContext';

function browserTimezone(): string | undefined {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

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
    setSessionExpiredHandler(() => setState({ status: 'anonymous' }));
    return () => setSessionExpiredHandler(null);
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const user = await authApi.login(input);
    setState({ status: 'authenticated', user });
  }, []);

  const register = useCallback(async (input: Omit<RegisterInput, 'timezone'>) => {
    const timezone = browserTimezone();
    const user = await authApi.register({ ...input, ...(timezone && { timezone }) });
    setState({ status: 'authenticated', user });
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setAccessToken(null);
      setState({ status: 'anonymous' });
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ state, login, register, logout }),
    [state, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
