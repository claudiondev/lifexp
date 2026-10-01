import { Navigate, Outlet } from 'react-router';
import { useAuth } from './useAuth';

/** Telas de login/cadastro: quem já está autenticado vai direto para a home. */
export function GuestRoute() {
  const { state } = useAuth();

  if (state.status === 'loading') {
    return <p className="p-6 text-center text-slate-500">Carregando...</p>;
  }
  if (state.status === 'authenticated') return <Navigate to="/" replace />;
  return <Outlet />;
}
