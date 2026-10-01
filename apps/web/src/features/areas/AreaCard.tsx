import { Archive, ArchiveRestore, Pencil } from 'lucide-react';
import type { Area } from '@lifexp/shared';
import { XpBar } from '@/components/game/XpBar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AreaBadge } from './AreaBadge';
import { AREA_COLOR_CLASSES } from './areaAppearance';

interface AreaCardProps {
  area: Area;
  pending?: boolean;
  onEdit: (area: Area) => void;
  onArchive: (area: Area) => void;
  onRestore: (area: Area) => void;
}

export function AreaCard({ area, pending, onEdit, onArchive, onRestore }: AreaCardProps) {
  const archived = area.archivedAt !== null;
  const colors = AREA_COLOR_CLASSES[area.color];

  return (
    <article
      aria-label={area.name}
      className={cn(
        'relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-card/80 p-5 backdrop-blur transition-opacity',
        archived && 'opacity-60',
      )}
    >
      <div
        aria-hidden
        className={cn('absolute inset-x-0 top-0 h-0.5', archived ? 'bg-border' : colors.solid)}
      />
      <div className="flex items-start gap-3">
        <AreaBadge color={area.color} icon={area.icon} />
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 font-display text-xl leading-tight font-bold">{area.name}</h2>
          <p className="font-hud text-xs tracking-wider text-muted-foreground uppercase">
            {archived ? 'Arquivada' : 'Atributo'}
          </p>
        </div>
        <div className="flex gap-1">
          {archived ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Restaurar ${area.name}`}
              disabled={pending}
              onClick={() => onRestore(area)}
            >
              <ArchiveRestore aria-hidden className="size-4" />
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Editar ${area.name}`}
                disabled={pending}
                onClick={() => onEdit(area)}
              >
                <Pencil aria-hidden className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Arquivar ${area.name}`}
                disabled={pending}
                onClick={() => onArchive(area)}
              >
                <Archive aria-hidden className="size-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Nível da área ainda não existe na API (Marco 1d); toda área nova começa no nível 1. */}
      <div>
        <XpBar
          progress={0}
          segments={10}
          label={`Experiência em ${area.name}`}
          segmentClassName="h-2"
          valueText="0 XP"
        />
        <p className="mt-2 font-hud text-xs text-muted-foreground tabular-nums">
          Nv 1 · <span className={colors.text}>0</span> XP
        </p>
      </div>
    </article>
  );
}
