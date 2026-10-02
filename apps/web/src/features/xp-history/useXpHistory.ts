import { useInfiniteQuery } from '@tanstack/react-query';
import type { XpEntryType } from '@lifexp/shared';
import { progressKey } from '../character/useProgress';
import { listXpHistory } from './xpHistoryApi';

/**
 * A chave nasce DENTRO da chave de progresso de propósito: tudo que muda o XP (concluir ou desfazer
 * bloco, marco, meta) já invalida `progress`, e o TanStack Query invalida por prefixo. Assim o
 * histórico acompanha sem que cada mutação precise lembrar dele.
 */
export const xpHistoryKey = [...progressKey, 'history'] as const;

/** Do mais novo ao mais antigo; "carregar mais" usa o cursor (RNF08). */
export function useXpHistory(type: XpEntryType | undefined) {
  return useInfiniteQuery({
    queryKey: [...xpHistoryKey, { type: type ?? 'all' }],
    queryFn: ({ pageParam }) => listXpHistory(type, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}
