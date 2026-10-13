import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateLeisureOptionInput } from '@lifexp/shared';
import * as leisureApi from './leisureApi';

/** Tudo do lazer mora sob esta chave: invalidá-la refaz o saldo e a lista de lazeres. */
export const leisureKey = ['leisure'] as const;

/**
 * O saldo da semana e o cronômetro. Buscado de novo a cada minuto: durante uma sessão o servidor já desconta o que
 * passou, e a contagem regressiva da tela é calculada no cliente a partir de `endsAt`.
 */
export function useLeisure(enabled = true) {
  return useQuery({
    queryKey: [...leisureKey, 'summary'],
    queryFn: leisureApi.getLeisure,
    enabled,
    refetchInterval: 60_000,
  });
}

export function useLeisureOptions(includeArchived: boolean, enabled = true) {
  return useQuery({
    queryKey: [...leisureKey, 'options', includeArchived],
    queryFn: () => leisureApi.listLeisureOptions(includeArchived),
    enabled,
  });
}

export function useLeisureMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: leisureKey });

  return {
    create: useMutation({ mutationFn: leisureApi.createLeisureOption, onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: UpdateLeisureOptionInput }) =>
        leisureApi.updateLeisureOption(id, input),
      onSuccess: refresh,
    }),
    start: useMutation({ mutationFn: leisureApi.startLeisureSession, onSuccess: refresh }),
    stop: useMutation({ mutationFn: leisureApi.stopLeisureSession, onSuccess: refresh }),
  };
}
