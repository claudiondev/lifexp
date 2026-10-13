import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/useAuth';
import { LeisureCard } from '@/features/leisure/LeisureCard';
import { LeisureOptionsManager } from '@/features/leisure/LeisureOptionsManager';
import { LeisureWeekSummary } from '@/features/leisure/LeisureWeekSummary';
import { useLeisure, useLeisureOptions } from '@/features/leisure/useLeisure';
import { PageHeader } from './PageHeader';

/**
 * Tempo de lazer: estudar rende minutos para gastar no que você gosta. Aqui estão o saldo da semana (zera na segunda),
 * o cronômetro, o que cada atividade rendeu e o cadastro dos seus lazeres.
 */
export function LeisurePage() {
  const { state } = useAuth();
  const timezone = state.status === 'authenticated' ? state.user.timezone : 'UTC';
  const summary = useLeisure();
  const options = useLeisureOptions(true);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <PageHeader
        eyebrow="Descanso merecido"
        title="Tempo de lazer"
        description="Cumprir blocos das atividades que geram lazer rende minutos para usar no que você gosta. O saldo vale até o fim da semana."
      />

      <div className="mt-6 flex flex-col gap-6">
        {summary.isPending && (
          <div
            aria-busy="true"
            className="h-32 animate-pulse rounded-2xl border border-border bg-card/50"
          />
        )}

        {summary.isError && (
          <div
            role="alert"
            className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5"
          >
            <p className="text-destructive">Não foi possível carregar o seu tempo de lazer.</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => void summary.refetch()}
            >
              Tentar de novo
            </Button>
          </div>
        )}

        {summary.data && options.data && (
          <>
            <LeisureCard showLinks={false} />
            <LeisureWeekSummary summary={summary.data} options={options.data} timezone={timezone} />
          </>
        )}

        <LeisureOptionsManager />
      </div>
    </main>
  );
}
