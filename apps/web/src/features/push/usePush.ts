import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '../notifications/useNotifications';
import {
  getPushConfig,
  getPushStatus,
  sendPushTest,
  subscribePush,
  unsubscribePush,
} from './pushApi';
import {
  currentSubscription,
  isPushSupported,
  notificationPermission,
  requestNotificationPermission,
  subscribeThisDevice,
  toSubscriptionInput,
  unsubscribeThisDevice,
} from './pushBrowser';
import { derivePhase } from './pushState';

const pushKey = ['push'] as const;
const statusKey = [...pushKey, 'status'] as const;

/**
 * O push deste aparelho (RF41): lê o que o servidor oferece e o que o navegador deixa, e expõe ativar, desativar e
 * testar. Ativar pede a permissão, inscreve o aparelho no navegador, guarda a inscrição na API e liga a preferência
 * de push; desativar faz o caminho inverso e, se esse era o último aparelho, desliga a preferência.
 */
export function usePush() {
  const queryClient = useQueryClient();
  const config = useQuery({
    queryKey: [...pushKey, 'config'],
    queryFn: getPushConfig,
    staleTime: Infinity,
  });
  const status = useQuery({ queryKey: statusKey, queryFn: getPushStatus });
  const preferences = useNotificationPreferences();
  const updatePreferences = useUpdateNotificationPreferences();

  const supported = isPushSupported();
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    supported ? notificationPermission() : 'default',
  );
  const [subscribed, setSubscribed] = useState<boolean | undefined>(supported ? undefined : false);

  const refreshLocal = useCallback(async () => {
    if (!supported) return;
    setPermission(notificationPermission());
    setSubscribed((await currentSubscription()) !== null);
  }, [supported]);

  useEffect(() => {
    void refreshLocal();
  }, [refreshLocal]);

  const setPushPreference = async (enabled: boolean) => {
    if (preferences.data?.pushEnabled === enabled) return;
    await updatePreferences.mutateAsync({ pushEnabled: enabled });
  };

  const activate = useMutation({
    mutationFn: async () => {
      const publicKey = config.data?.publicKey;
      if (!publicKey) throw new Error('O push não está ligado neste servidor.');
      const result = await requestNotificationPermission();
      setPermission(result);
      if (result !== 'granted')
        throw new Error('Sem a permissão do navegador não dá para enviar avisos.');

      const subscription = await subscribeThisDevice(publicKey);
      try {
        await subscribePush(toSubscriptionInput(subscription));
      } catch (error) {
        // Não deixa o navegador inscrito sem a API saber: o aparelho ficaria "ativo" sem receber nada.
        await subscription.unsubscribe();
        throw error;
      }
      await setPushPreference(true);
    },
    onSettled: async () => {
      await refreshLocal();
      await queryClient.invalidateQueries({ queryKey: statusKey });
    },
  });

  const deactivate = useMutation({
    mutationFn: async () => {
      const endpoint = await unsubscribeThisDevice();
      if (endpoint) await unsubscribePush(endpoint);
      const after = await queryClient.fetchQuery({
        queryKey: statusKey,
        queryFn: getPushStatus,
        staleTime: 0,
      });
      if (after.devices === 0) await setPushPreference(false);
    },
    onSettled: async () => {
      await refreshLocal();
      await queryClient.invalidateQueries({ queryKey: statusKey });
    },
  });

  const test = useMutation({ mutationFn: sendPushTest });

  const phase = derivePhase({
    config: config.data,
    configFailed: config.isError,
    supported,
    permission,
    subscribed,
  });

  return {
    phase,
    devices: status.data?.devices ?? 0,
    pushEnabled: preferences.data?.pushEnabled ?? false,
    activate,
    deactivate,
    test,
    setPushPreference: updatePreferences,
    retry: () => void config.refetch(),
  };
}
