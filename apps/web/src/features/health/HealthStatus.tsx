import { cn } from '@/lib/utils';
import { useHealth } from './useHealth';

export function HealthStatus() {
  const state = useHealth();

  const dot = cn(
    'size-2 rounded-full',
    state.kind === 'ok' && 'bg-mana shadow-[0_0_8px_var(--mana)]',
    state.kind === 'loading' && 'animate-pulse bg-muted-foreground',
    state.kind === 'error' && 'bg-destructive',
  );

  return (
    <p
      role={state.kind === 'error' ? 'alert' : 'status'}
      className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 font-hud text-xs tracking-wide text-muted-foreground"
    >
      <span aria-hidden className={dot} />
      {state.kind === 'loading' && 'Verificando a API...'}
      {state.kind === 'ok' && (
        <>
          API <strong className="font-medium text-foreground">ok</strong>
        </>
      )}
      {state.kind === 'error' && <>API indisponível: {state.message}</>}
    </p>
  );
}
