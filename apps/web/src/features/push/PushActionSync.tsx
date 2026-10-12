import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { completionAffectedKeys } from '../today/useCompletionMutations';

/**
 * Ouve o service worker (RF41): marcar "Cumpri"/"Pulei" pelo botão da notificação atualiza o app
 * sem precisar recarregar a página, mesmo que a pessoa não tenha tocado em nada. Não renderiza nada.
 */
export function PushActionSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if ((event.data as { type?: string } | undefined)?.type !== 'lifexp-checkin') return;
      for (const queryKey of completionAffectedKeys) {
        void queryClient.invalidateQueries({ queryKey });
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [queryClient]);

  return null;
}
