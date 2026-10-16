import { useConsistency } from './useConsistency';
import { ConsistencyHeatmap } from './ConsistencyHeatmap';
import { HEATMAP_WEEKS } from './heatmapModel';

/**
 * Seção "Constância" da tela de evolução. É um EXTRA: se a consulta falha, só ela avisa (em texto, sem `role="alert"`)
 * e o resto da tela segue funcionando.
 */
export function ConsistencySection() {
  const consistency = useConsistency(HEATMAP_WEEKS);

  return (
    <section aria-labelledby="consistency-title" className="space-y-3">
      <h2 id="consistency-title" className="hud-label">
        Constância · últimas {HEATMAP_WEEKS} semanas
      </h2>

      {consistency.isPending && (
        <div
          aria-busy="true"
          className="h-40 animate-pulse rounded-2xl border border-border bg-card/50"
        />
      )}
      {consistency.isError && (
        <p className="rounded-2xl border border-dashed border-border bg-card/40 p-5 text-sm text-muted-foreground">
          Não foi possível carregar a constância agora.{' '}
          <button
            type="button"
            onClick={() => void consistency.refetch()}
            className="font-semibold text-xp hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          >
            Tentar de novo
          </button>
        </p>
      )}
      {consistency.data && <ConsistencyHeatmap consistency={consistency.data} />}
    </section>
  );
}
