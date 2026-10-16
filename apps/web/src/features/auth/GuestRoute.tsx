import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './useAuth';

/** Só aceita caminho do próprio app: "//outro.site" e "https://..." viram a home. */
function safeFrom(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/';
}

/**
 * Telas de login/cadastro: quem já está autenticado sai delas. Vai para a página que a pessoa tentou abrir
 * antes de ser levada ao login (`state.from`, posto pelo `ProtectedRoute`) ou, sem isso, para a home.
 * Precisa decidir aqui: o login muda o estado de autenticação antes do `navigate` da tela rodar.
 */
export function GuestRoute() {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === 'loading') {
    return <p className="p-6 text-center text-slate-500">Carregando...</p>;
  }
  if (state.status === 'authenticated') {
    return <Navigate to={safeFrom((location.state as { from?: unknown } | null)?.from)} replace />;
  }
  return <Outlet />;
}
