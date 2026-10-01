import { useEffect, useState } from 'react';
import type { HealthResponse } from '@lifexp/shared';
import { fetchHealth } from './healthApi';

export type HealthState =
  { kind: 'loading' } | { kind: 'ok'; data: HealthResponse } | { kind: 'error'; message: string };

export function useHealth(): HealthState {
  const [state, setState] = useState<HealthState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetchHealth()
      .then((data) => !cancelled && setState({ kind: 'ok', data }))
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({ kind: 'error', message: error instanceof Error ? error.message : 'Erro' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
