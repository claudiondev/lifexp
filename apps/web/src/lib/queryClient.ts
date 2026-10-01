import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './apiClient';

/** Não adianta repetir erro do cliente (4xx): só falhas de rede e 5xx, e no máximo 2 vezes. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status < 500) return false;
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: shouldRetry, refetchOnWindowFocus: false },
    },
  });
}
