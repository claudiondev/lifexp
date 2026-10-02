/**
 * Em que pé está o push NESTE aparelho (RF41). Ordem de precedência: o servidor sem chaves vence tudo (não adianta
 * pedir permissão); depois o navegador sem suporte; depois a permissão negada; por fim, inscrito ou não.
 */
export type PushPhase =
  'loading' | 'error' | 'server-off' | 'unsupported' | 'denied' | 'off' | 'on';

export function derivePhase(input: {
  config: { enabled: boolean } | undefined;
  configFailed: boolean;
  supported: boolean;
  permission: NotificationPermission;
  subscribed: boolean | undefined;
}): PushPhase {
  if (input.configFailed) return 'error';
  if (!input.config) return 'loading';
  if (!input.config.enabled) return 'server-off';
  if (!input.supported) return 'unsupported';
  if (input.permission === 'denied') return 'denied';
  if (input.subscribed === undefined) return 'loading';
  return input.subscribed ? 'on' : 'off';
}

export const PHASE_TEXT: Record<Exclude<PushPhase, 'loading' | 'error' | 'off' | 'on'>, string> = {
  'server-off': 'O push não está ligado neste servidor. Os avisos continuam no sino do topo.',
  unsupported:
    'Este navegador não faz push. No iPhone ou iPad (iOS 16.4 ou mais novo), instale o app pela Tela de Início (Compartilhar > Adicionar à Tela de Início) e abra o LifeXP por ele.',
  denied:
    'Você bloqueou as notificações do LifeXP neste navegador. Libere nas configurações do site no navegador e volte aqui.',
};
