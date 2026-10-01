import { HealthStatus } from '../features/health/HealthStatus';
import { useAuth } from '../features/auth/useAuth';

export function HomePage() {
  const { state, logout } = useAuth();
  if (state.status !== 'authenticated') return null;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-4xl font-bold">LifeXP</h1>
      <p className="text-xl">Olá, {state.user.name}</p>
      <p className="text-slate-600">Planejador semanal gamificado</p>
      <HealthStatus />
      <button
        type="button"
        onClick={() => void logout()}
        className="rounded-md border border-slate-300 px-4 py-2 hover:bg-slate-100"
      >
        Sair
      </button>
    </main>
  );
}
