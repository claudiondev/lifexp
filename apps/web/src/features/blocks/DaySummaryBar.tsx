import { cn } from '@/lib/utils';
import { AREA_COLOR_CLASSES } from '../areas/areaAppearance';
import { formatDuration } from './blockOptions';
import type { DaySummary } from './daySummary';

/** Faixa com uma fatia por área, proporcional aos minutos planejados. Só enfeite: o texto diz o resto. */
export function AreaStrip({ summary, className }: { summary: DaySummary; className?: string }) {
  return (
    <div
      aria-hidden
      data-testid="area-strip"
      className={cn('flex h-1 w-full overflow-hidden rounded-full bg-border/60', className)}
    >
      {summary.areas.map(({ color, minutes }) => (
        <span
          key={color}
          className={AREA_COLOR_CLASSES[color].solid}
          style={{ flexGrow: minutes, flexBasis: 0 }}
        />
      ))}
    </div>
  );
}

/** "2/3 · 4 h" sob o dia na grade. Sem blocos, não ocupa lugar. */
export function DaySummaryLine({ summary }: { summary: DaySummary }) {
  if (summary.planned === 0) return <span aria-hidden className="h-[1.1rem]" />;
  return (
    <span className="font-hud text-[0.65rem] text-muted-foreground tabular-nums">
      {summary.done}/{summary.planned} · {formatDuration(summary.plannedMinutes)}
    </span>
  );
}
