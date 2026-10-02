import { Laptop, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '../auth/useAuth';
import { relativeTime } from '../notifications/notificationFormat';
import { otherSessions, revokedMessage, startedOn } from './sessionFormat';
import { useSessionMutations, useSessions } from './useSessions';

const MOBILE = /iOS|Android/;

/** Dispositivos com sessão ativa (RF48): ver, encerrar um e encerrar todos os outros. */
export function SessionsCard() {
  const { state } = useAuth();
  const sessions = useSessions();
  const { revoke, revokeOthers } = useSessionMutations();
  const timezone = state.status === 'authenticated' ? state.user.timezone : 'UTC';
  const others = sessions.data ? otherSessions(sessions.data) : [];

  const endOne = (id: string) =>
    revoke.mutate(id, {
      onSuccess: () => toast.success('Sessão encerrada'),
      onError: (error) => toast.error(error.message),
    });
  const endOthers = () =>
    revokeOthers.mutate(undefined, {
      onSuccess: (count) => toast.success(revokedMessage(count)),
      onError: (error) => toast.error(error.message),
    });

  return (
    <section
      aria-labelledby="sessions-title"
      className="mt-6 rounded-2xl border border-border bg-card/80 p-5 backdrop-blur sm:p-6"
    >
      <h2 id="sessions-title" className="font-display text-xl font-bold">
        Dispositivos conectados
      </h2>
      <p className="text-sm text-muted-foreground">
        Onde a sua conta está aberta. Ao encerrar um dispositivo, ele sai na hora.
      </p>

      {sessions.isPending && (
        <div aria-busy="true" className="mt-4 h-24 animate-pulse rounded-xl bg-background/40" />
      )}

      {sessions.isError && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-4"
        >
          <p className="text-sm text-destructive">Não foi possível carregar os dispositivos.</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => void sessions.refetch()}
          >
            Tentar de novo
          </Button>
        </div>
      )}

      {sessions.isSuccess && (
        <>
          <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
            {sessions.data.map((session) => {
              const Icon = MOBILE.test(session.device) ? Smartphone : Laptop;
              return (
                <li key={session.id} className="flex items-center gap-3 px-4 py-3">
                  <span
                    aria-hidden
                    className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-xp"
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {session.device}
                      {session.current && (
                        <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-foreground">
                          Esta sessão
                        </span>
                      )}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      Entrou em {startedOn(session, timezone)} · usada{' '}
                      {relativeTime(session.lastUsedAt, new Date())}
                    </p>
                  </div>
                  {!session.current && (
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={`Encerrar sessão: ${session.device}`}
                      disabled={revoke.isPending}
                      onClick={() => endOne(session.id)}
                    >
                      Encerrar
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          {others.length > 0 && (
            <Button
              variant="secondary"
              className="mt-4"
              disabled={revokeOthers.isPending}
              onClick={endOthers}
            >
              Encerrar todas as outras
            </Button>
          )}
        </>
      )}
    </section>
  );
}
