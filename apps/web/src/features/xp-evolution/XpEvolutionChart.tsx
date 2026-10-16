import type { AreaColor, XpEvolutionWeek } from '@lifexp/shared';
import { cn } from '@/lib/utils';
import { AREA_COLOR_CLASSES } from '../areas/areaAppearance';
import { buildBars, formatXp } from './xpEvolutionModel';

/** Fatia sem área (ou de área excluída): cinza discreto, para não competir com as cores das áreas. */
const NEUTRAL_BAR = 'bg-muted-foreground/40';
const barClass = (color: AreaColor | null) =>
  color ? AREA_COLOR_CLASSES[color].solid : NEUTRAL_BAR;

/** Uma coluna por semana, empilhada por área. A última coluna é a semana atual (ainda em andamento). */
export function XpEvolutionChart({ weeks }: { weeks: readonly XpEvolutionWeek[] }) {
  const bars = buildBars(weeks);

  return (
    <figure className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6">
      <figcaption className="sr-only">
        XP líquido por semana, da mais antiga para a atual
      </figcaption>
      <ol className="flex h-56 items-end gap-1.5 sm:gap-3">
        {bars.map((bar) => (
          <li
            key={bar.weekStart}
            className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1.5"
          >
            <span className="sr-only">
              Semana de {bar.label}
              {bar.isCurrent ? ' (atual)' : ''}: {formatXp(bar.net)}
            </span>
            <span
              aria-hidden
              className={cn(
                'text-center font-hud text-[0.7rem] tabular-nums',
                bar.net > 0 ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {bar.net === 0 ? '–' : bar.net}
            </span>
            <div aria-hidden className="flex min-h-0 flex-1 flex-col justify-end">
              <div
                data-testid="xp-bar"
                data-week={bar.weekStart}
                className={cn(
                  'flex w-full flex-col-reverse overflow-hidden rounded-t-md',
                  bar.isCurrent && 'ring-1 ring-xp/60',
                )}
                style={{ height: `${bar.height * 100}%` }}
              >
                {bar.segments.map((segment) => (
                  <div
                    key={segment.areaId ?? 'none'}
                    className={barClass(segment.color)}
                    style={{ height: `${segment.share * 100}%` }}
                  />
                ))}
              </div>
            </div>
            <span
              aria-hidden
              className={cn(
                'text-center font-hud text-[0.65rem] tabular-nums',
                bar.isCurrent ? 'font-semibold text-xp' : 'text-muted-foreground',
              )}
            >
              {bar.isCurrent ? 'Atual' : bar.label}
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
