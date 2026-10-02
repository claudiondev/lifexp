import { BellRing } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { PHASE_TEXT } from './pushState';
import { usePush } from './usePush';

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Algo deu errado. Tente de novo.';

/**
 * Avisos no celular (RF41): ativar o push neste aparelho, testar e pausar. Mostra com clareza por que o recurso pode
 * estar indisponível (servidor sem chaves, navegador sem suporte, permissão negada) em vez de um botão que não faz nada.
 */
export function PushCard() {
  const push = usePush();
  const busy = push.activate.isPending || push.deactivate.isPending || push.test.isPending;

  const activate = () =>
    push.activate.mutate(undefined, {
      onSuccess: () => toast.success('Push ativado neste aparelho'),
      onError: (error) => toast.error(errorText(error)),
    });
  const deactivate = () =>
    push.deactivate.mutate(undefined, {
      onSuccess: () => toast.success('Push desativado neste aparelho'),
      onError: (error) => toast.error(errorText(error)),
    });
  const test = () =>
    push.test.mutate(undefined, {
      onSuccess: ({ sent }) =>
        sent > 0
          ? toast.success('Aviso de teste enviado', {
              description: 'Ele deve chegar em instantes.',
            })
          : toast.error('O teste não chegou a nenhum aparelho', {
              description: 'Desative e ative o push de novo neste aparelho.',
            }),
      onError: (error) => toast.error(errorText(error)),
    });

  return (
    <section
      aria-labelledby="push-title"
      className="mt-6 rounded-2xl border border-border bg-card/80 p-5 backdrop-blur sm:p-6"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid size-9 place-items-center rounded-lg bg-secondary text-xp"
        >
          <BellRing className="size-4" />
        </span>
        <div>
          <h2 id="push-title" className="font-display text-xl font-bold">
            Avisos no celular
          </h2>
          <p className="text-sm text-muted-foreground">
            Receba os lembretes e o resumo como notificação do celular, mesmo com o app fechado.
          </p>
        </div>
      </div>

      <div className="mt-4">
        {push.phase === 'loading' && (
          <div aria-busy="true" className="h-12 animate-pulse rounded-xl bg-background/40" />
        )}

        {push.phase === 'error' && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/40 bg-destructive/10 p-4"
          >
            <p className="text-sm text-destructive">Não foi possível verificar o push.</p>
            <Button variant="secondary" size="sm" className="mt-2" onClick={push.retry}>
              Tentar de novo
            </Button>
          </div>
        )}

        {(push.phase === 'server-off' ||
          push.phase === 'unsupported' ||
          push.phase === 'denied') && (
          <p className="text-sm text-muted-foreground">{PHASE_TEXT[push.phase]}</p>
        )}

        {push.phase === 'off' && (
          <Button onClick={activate} disabled={busy}>
            Ativar neste aparelho
          </Button>
        )}

        {push.phase === 'on' && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Ativo neste aparelho ({push.devices} {push.devices === 1 ? 'aparelho' : 'aparelhos'}{' '}
              no total).
            </p>
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="push-enabled" className="text-sm font-medium">
                Receber os avisos por push
              </label>
              <Switch
                id="push-enabled"
                aria-label="Receber os avisos por push"
                checked={push.pushEnabled}
                disabled={busy || push.setPushPreference.isPending}
                onCheckedChange={(checked) =>
                  push.setPushPreference.mutate(
                    { pushEnabled: checked },
                    { onError: (error) => toast.error(errorText(error)) },
                  )
                }
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={test} disabled={busy}>
                Enviar teste
              </Button>
              <Button variant="ghost" size="sm" onClick={deactivate} disabled={busy}>
                Desativar neste aparelho
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
