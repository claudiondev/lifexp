import { useHealth } from './useHealth';

export function HealthStatus() {
  const state = useHealth();

  if (state.kind === 'loading') return <p className="text-slate-500">Verificando a API...</p>;
  if (state.kind === 'error') {
    return (
      <p role="alert" className="text-red-600">
        API indisponível: {state.message}
      </p>
    );
  }
  return (
    <p className="text-emerald-600">
      API <strong>{state.data.status}</strong> · {state.data.timestamp}
    </p>
  );
}
