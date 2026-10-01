import { useState } from 'react';
import { ApiError } from '../../lib/apiClient';

/** Centraliza o estado de envio/erro do servidor dos formulários de auth. */
export function useServerError() {
  const [serverError, setServerError] = useState<string | null>(null);

  async function run(action: () => Promise<void>): Promise<void> {
    setServerError(null);
    try {
      await action();
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : 'Não foi possível conectar à API');
    }
  }

  return { serverError, run };
}
