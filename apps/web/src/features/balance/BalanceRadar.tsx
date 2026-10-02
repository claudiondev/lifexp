import type { BalanceArea } from '@lifexp/shared';
import { AREA_COLOR_CLASSES, AREA_ICON_COMPONENTS } from '@/features/areas/areaAppearance';
import { cn } from '@/lib/utils';
import { MIN_RADAR_AXES, radarPoint, toPolygonPoints } from './radarGeometry';

const SIZE = 280;
const CENTER = SIZE / 2;
const RADIUS = 92;
const RINGS = [0.25, 0.5, 0.75, 1];
const MAX_LABEL = 12;

const truncate = (text: string) =>
  text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1)}…` : text;

/** "7 de 10 blocos" ou, sem nada planejado, a explicação em vez de um zero que pareceria abandono. */
export const areaSummary = (area: BalanceArea): string =>
  area.score === null
    ? 'Sem blocos planejados no período'
    : `${area.completed} de ${area.planned} ${area.planned === 1 ? 'bloco' : 'blocos'}`;

/**
 * Radar de equilíbrio (RF24). A nota é a aderência (blocos concluídos ÷ planejados), nunca XP nem minutos
 * (RN40, RN42). A área sem blocos fica no centro e com "sem dados": não é o mesmo que zero. O desenho é
 * decorativo; a lista abaixo diz a mesma coisa em texto e é o que leitores de tela usam.
 */
export function BalanceRadar({ areas }: { areas: BalanceArea[] }) {
  const showRadar = areas.length >= MIN_RADAR_AXES;
  const polygon = areas.map((area, index) =>
    radarPoint(index, areas.length, (area.score ?? 0) / 100, RADIUS, CENTER, CENTER),
  );

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
      {showRadar && (
        <svg
          data-testid="balance-radar"
          aria-hidden
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="size-64 shrink-0 text-muted-foreground sm:size-72"
        >
          {RINGS.map((ring) => (
            <polygon
              key={ring}
              points={toPolygonPoints(
                areas.map((_, index) =>
                  radarPoint(index, areas.length, ring, RADIUS, CENTER, CENTER),
                ),
              )}
              className="fill-none stroke-border"
              strokeWidth={ring === 1 ? 1.5 : 1}
            />
          ))}
          {areas.map((area, index) => {
            const end = radarPoint(index, areas.length, 1, RADIUS, CENTER, CENTER);
            const label = radarPoint(index, areas.length, 1.2, RADIUS, CENTER, CENTER);
            const anchor = label.x < CENTER - 4 ? 'end' : label.x > CENTER + 4 ? 'start' : 'middle';
            return (
              <g key={area.areaId}>
                <line
                  x1={CENTER}
                  y1={CENTER}
                  x2={end.x}
                  y2={end.y}
                  className="stroke-border"
                  strokeWidth={1}
                />
                <text
                  x={label.x}
                  y={label.y}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  className="fill-current text-[10px]"
                >
                  {truncate(area.name)}
                </text>
              </g>
            );
          })}
          <polygon
            points={toPolygonPoints(polygon)}
            className="fill-primary/25 stroke-primary"
            strokeWidth={2}
            strokeLinejoin="round"
          />
          {areas.map((area, index) => (
            <circle
              key={area.areaId}
              cx={polygon[index]!.x}
              cy={polygon[index]!.y}
              r={3.5}
              className={cn(
                area.score === null
                  ? 'fill-card stroke-muted-foreground'
                  : 'fill-primary stroke-card',
              )}
              strokeWidth={1.5}
            />
          ))}
        </svg>
      )}

      <ul aria-label="Aderência por área" className="flex w-full min-w-0 flex-1 flex-col gap-3">
        {areas.map((area) => {
          const { Icon } = AREA_ICON_COMPONENTS[area.icon];
          const color = AREA_COLOR_CLASSES[area.color];
          return (
            <li key={area.areaId} className="flex items-center gap-3">
              <span
                className={cn('grid size-8 shrink-0 place-items-center rounded-lg', color.soft)}
              >
                <Icon aria-hidden className={cn('size-4', color.text)} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">{area.name}</span>
                  <span className="font-hud text-sm tabular-nums">
                    {area.score === null ? 'sem dados' : `${area.score}%`}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`Aderência de ${area.name}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={area.score ?? 0}
                  aria-valuetext={
                    area.score === null ? 'sem dados' : `${area.score}% (${areaSummary(area)})`
                  }
                  className="mt-1 h-1.5 rounded-full bg-muted"
                >
                  <div
                    className={cn('h-full rounded-full', color.solid)}
                    style={{ width: `${area.score ?? 0}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{areaSummary(area)}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
