import type { XpEvolution } from '@lifexp/shared';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AREA_COLOR_CLASSES } from '@/features/areas/areaAppearance';
import { ConsistencySection } from '@/features/consistency/ConsistencySection';
import { useXpEvolution } from '@/features/xp-evolution/useXpEvolution';
import { XpEvolutionChart } from '@/features/xp-evolution/XpEvolutionChart';
import {
  DEFAULT_PERIOD,
  PERIOD_OPTIONS,
  bestWeekNote,
  compareWeeks,
  comparisonMessage,
  formatXp,
} from '@/features/xp-evolution/xpEvolutionModel';
import { cn } from '@/lib/utils';
import { PageHeader } from './PageHeader';

function Summary({ data }: { data: XpEvolution }) {
  const comparison = compareWeeks(data.weeks);
  const best = bestWeekNote(data.weeks);
  const currentAreas = data.weeks.at(-1)!.byArea;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section aria-label="Esta semana" className="rounded-2xl border border-border bg-card/60 p-5">
        <p className="hud-label">Esta semana</p>
        <p className="mt-1 font-display text-4xl font-extrabold text-xp tabular-nums">
          {formatXp(comparison.current)}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">{comparisonMessage(comparison)}</p>
        {best && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Sparkles aria-hidden className="size-4 text-reward" />
            {best}
          </p>
        )}
      </section>

      <section
        aria-label="Por área nesta semana"
        className="rounded-2xl border border-border bg-card/60 p-5"
      >
        <p className="hud-label">Por área nesta semana</p>
        {currentAreas.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Ainda sem XP por área nesta semana.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {currentAreas.map((area) => (
              <li key={area.areaId ?? 'none'} className="flex items-center gap-2 text-sm">
                <span
                  aria-hidden
                  className={cn(
                    'size-3 shrink-0 rounded-full',
                    area.color ? AREA_COLOR_CLASSES[area.color].solid : 'bg-muted-foreground/40',
                  )}
                />
                <span className="min-w-0 flex-1 truncate">{area.name}</span>
                <span className="font-hud tabular-nums">{formatXp(area.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function XpEvolutionPage() {
  const [weeks, setWeeks] = useState<number>(DEFAULT_PERIOD);
  const evolution = useXpEvolution(weeks);
  const data = evolution.data;
  const empty = data?.weeks.every((week) => week.gained === 0 && week.reverted === 0) ?? false;

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <PageHeader
        eyebrow="Evoluir"
        title="Evolução do XP"
        description="Quanto XP você ganhou em cada semana e em quais áreas."
      />

      <div role="group" aria-label="Período" className="mt-6 flex flex-wrap gap-2">
        {PERIOD_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={weeks === option}
            onClick={() => setWeeks(option)}
            className={cn(
              'h-9 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              weeks === option
                ? 'border-primary bg-primary/15 text-foreground'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {option} semanas
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        {evolution.isPending && (
          <div
            aria-busy="true"
            className="h-72 animate-pulse rounded-2xl border border-border bg-card/50"
          />
        )}

        {evolution.isError && (
          <div
            role="alert"
            className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5"
          >
            <p className="text-destructive">Não foi possível carregar a evolução do XP.</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => void evolution.refetch()}
            >
              Tentar de novo
            </Button>
          </div>
        )}

        {data && empty && (
          <p className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center text-muted-foreground">
            Nenhum XP neste período ainda. Conclua um bloco para a sua evolução aparecer aqui.
          </p>
        )}

        {data && !empty && (
          <>
            <XpEvolutionChart weeks={data.weeks} />
            <Summary data={data} />
          </>
        )}
      </div>

      <div className="mt-10">
        <ConsistencySection />
      </div>
    </main>
  );
}
