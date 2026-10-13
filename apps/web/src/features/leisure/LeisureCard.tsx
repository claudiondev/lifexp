import { Hourglass } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LeisureIconView } from './leisureAppearance';
import {
  formatCountdown,
  formatLeisure,
  remainingMinutesText,
  remainingSeconds,
} from './leisureFormat';
import { leisureKey, useLeisure, useLeisureMutations, useLeisureOptions } from './useLeisure';
import { useNow } from './useNow';

/**
 * O tempo de lazer ganho na semana e o cronômetro. É um EXTRA da tela Hoje: se a consulta falha, o cartão some e a tela
 * segue sem ele. Aparece quando há lazer cadastrado, saldo ou uma sessão correndo. `showLinks` liga aos detalhes e ao
 * cadastro (desligado na própria página de lazer).
 */
export function LeisureCard({ showLinks = true }: { showLinks?: boolean }) {
  const summary = useLeisure();
  const options = useLeisureOptions(true);
  const { start, stop } = useLeisureMutations();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const active = summary.data?.activeSession ?? null;
  const now = useNow(active !== null);
  const seconds = active ? remainingSeconds(active, now) : 0;

  // Ao chegar a zero, o servidor já considera a sessão encerrada: refaz o saldo uma vez por sessão.
  const refreshedFor = useRef<string | null>(null);
  useEffect(() => {
    if (active && seconds === 0 && refreshedFor.current !== active.id) {
      refreshedFor.current = active.id;
      void queryClient.invalidateQueries({ queryKey: leisureKey });
    }
  }, [active, seconds, queryClient]);

  if (!summary.data || !options.data) return null;
  const data = summary.data;
  const allOptions = options.data;
  const usable = allOptions.filter((option) => option.archivedAt === null);
  if (usable.length === 0 && data.balanceMin === 0 && !active) return null;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Algo deu errado. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (optionId: string) =>
    allOptions.find((option) => option.id === optionId)?.name ?? 'Lazer';

  const handleStart = (optionId: string) =>
    run(async () => {
      await start.mutateAsync(optionId);
    });

  const handleStop = () =>
    run(async () => {
      if (!active) return;
      const stopped = await stop.mutateAsync(active.id);
      toast.success(`${nameOf(stopped.optionId)}: ${formatLeisure(stopped.usedMin)} aproveitados`);
    });

  return (
    <section
      aria-label="Tempo de lazer"
      className="rounded-2xl border border-border bg-card/80 p-4 backdrop-blur sm:p-5"
    >
      <div className="flex items-start gap-3">
        <Hourglass aria-hidden className={cn('mt-0.5 size-5 shrink-0', active && 'text-mana')} />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-bold">Tempo de lazer</h2>
          <p className="text-sm text-muted-foreground">
            {active
              ? `${nameOf(active.optionId)} em andamento`
              : data.balanceMin > 0
                ? 'Você conquistou este tempo. Aproveite!'
                : 'Cumpra blocos das atividades que geram lazer para ganhar tempo.'}
          </p>
        </div>
        <p className="font-hud text-sm font-bold text-mana tabular-nums">
          {formatLeisure(data.balanceMin)}
          <span className="sr-only"> disponíveis</span>
        </p>
      </div>

      {showLinks && (
        <p className="mt-2 text-xs">
          <Link to="/lazer" className="text-muted-foreground underline underline-offset-2">
            Ver detalhes
          </Link>
        </p>
      )}

      {active ? (
        <div className="mt-4 flex items-center justify-between gap-3">
          <p
            role="timer"
            aria-label="Tempo restante"
            className="font-hud text-3xl font-bold text-mana tabular-nums"
          >
            {formatCountdown(seconds)}
          </p>
          <p aria-live="polite" className="sr-only">
            {remainingMinutesText(seconds)}
          </p>
          <Button variant="secondary" disabled={busy} onClick={() => void handleStop()}>
            Parar
          </Button>
        </div>
      ) : data.balanceMin > 0 && usable.length === 0 ? (
        showLinks && (
          <p className="mt-4 text-sm">
            <Link to="/lazer" className="underline underline-offset-2">
              Cadastre um lazer
            </Link>{' '}
            para usar o seu tempo.
          </p>
        )
      ) : (
        data.balanceMin > 0 && (
          <ul aria-label="Usar o tempo de lazer" className="mt-4 flex flex-wrap gap-2">
            {usable.map((option) => (
              <li key={option.id}>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => void handleStart(option.id)}
                >
                  <LeisureIconView icon={option.icon} className="size-4" />
                  {option.name}
                </Button>
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  );
}
