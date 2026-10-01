import { HealthStatus } from './features/health/HealthStatus';

export function App() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-4xl font-bold">LifeXP</h1>
      <p className="text-slate-600">Planejador semanal gamificado</p>
      <HealthStatus />
    </main>
  );
}
