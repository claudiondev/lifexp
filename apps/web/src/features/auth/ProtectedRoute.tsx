import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './useAuth';

export function ProtectedRoute() {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === 'loading') {
    return <p className="p-6 text-center text-slate-500">Carregando...</p>;
  }
  if (state.status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
