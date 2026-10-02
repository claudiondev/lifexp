import type { AreaAdherence, WeekSummary } from '@lifexp/shared';
import { cn } from '@/lib/utils';
import { AreaBadge } from '../areas/AreaBadge';
import { AREA_COLOR_CLASSES } from '../areas/areaAppearance';
import {
  completedText,
  formatAdherence,
  hasPlans,
  minutesText,
  skippedText,
  xpText,
} from './reviewFormat';

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/50 p-4">
      <p className="font-hud text-[0.7rem] tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

function AreaRow({ area }: { area: AreaAdherence }) {
  const percent = area.adherence === null ? 0 : Math.round(area.adherence * 100);
  return (
    <li className="flex items-center gap-3 py-3">
      <AreaBadge color={area.color} icon={area.icon} className="size-9" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate font-medium">{area.name}</p>
          <p className="shrink-0 font-hud text-sm tabular-nums">
            {formatAdherence(area.adherence)}
          </p>
        </div>
        <div
          role="progressbar"
          aria-label={`Aderência em ${area.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={completedText(area.planned, area.completed)}
          className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-500',
              AREA_COLOR_CLASSES[area.color].solid,
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {completedText(area.planned, area.completed)} ·{' '}
          {minutesText(area.plannedMin, area.completedMin)}
        </p>
      </div>
    </li>
  );
}

/** O que foi planejado e o que foi cumprido na semana (RF46), no total e por área. */
export function ReviewSummary({ summary }: { summary: WeekSummary }) {
  const { totals } = summary;
  const skipped = skippedText(totals.skipped);

  if (!hasPlans(totals)) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-background/40 p-6 text-center text-muted-foreground">
        <p>Nenhum bloco planejado nesta semana.</p>
        {skipped && <p className="mt-1 text-sm">{skipped}</p>}
        {totals.xp !== 0 && <p className="mt-1 text-sm">XP da semana: {xpText(totals.xp)}</p>}
      </div>
    );
  }

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile
          label="Blocos"
          value={formatAdherence(totals.adherence)}
          hint={completedText(totals.planned, totals.completed)}
        />
        <Tile label="Tempo" value={minutesText(totals.plannedMin, totals.completedMin)} />
        <Tile label="XP da semana" value={xpText(totals.xp)} />
      </div>
      {skipped && <p className="mt-3 text-sm text-muted-foreground">{skipped}</p>}
      <h3 className="mt-6 font-display text-lg font-bold">Por área</h3>
      <ul className="mt-1 divide-y divide-border">
        {summary.areas.map((area) => (
          <AreaRow key={area.areaId} area={area} />
        ))}
      </ul>
    </div>
  );
}
