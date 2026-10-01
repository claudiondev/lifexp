import { Archive, ArchiveRestore, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { Activity, Area } from '@lifexp/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ActivityFormDialog } from './ActivityFormDialog';
import { formatWeight } from './formatWeight';
import { useActivityMutations } from './useActivities';

interface ActivityListProps {
  area: Area;
  activities: Activity[];
}

/** Atividades de uma área. Área arquivada é somente leitura: restaure a área para editar. */
export function ActivityList({ area, activities }: ActivityListProps) {
  const [dialog, setDialog] = useState<{ open: boolean; activity: Activity | null }>({
    open: false,
    activity: null,
  });
  const { archive, unarchive } = useActivityMutations();
  const readOnly = area.archivedAt !== null;
  const pending = archive.isPending || unarchive.isPending;

  const restore = (activity: Activity) =>
    unarchive.mutate(activity.id, {
      onSuccess: () => toast.success(`Atividade “${activity.name}” restaurada`),
      onError: (error) => toast.error(error.message),
    });

  const archiveWithUndo = (activity: Activity) =>
    archive.mutate(activity.id, {
      onSuccess: () =>
        toast.success(`Atividade “${activity.name}” arquivada`, {
          action: { label: 'Desfazer', onClick: () => restore(activity) },
        }),
      onError: (error) => toast.error(error.message),
    });

  return (
    <div className="border-t border-border pt-4">
      <div className="flex items-center justify-between">
        <h3 className="font-hud text-xs tracking-wider text-muted-foreground uppercase">
          Atividades
        </h3>
        {!readOnly && (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Adicionar atividade em ${area.name}`}
            onClick={() => setDialog({ open: true, activity: null })}
          >
            <Plus aria-hidden className="size-4" />
            Adicionar
          </Button>
        )}
      </div>

      {activities.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Nenhuma atividade. Crie uma para poder planejar blocos nesta área.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {activities.map((activity) => {
            const archived = activity.archivedAt !== null;
            return (
              <li
                key={activity.id}
                className={cn(
                  'flex items-center gap-2 rounded-lg py-1 pl-2 text-sm',
                  archived && 'opacity-60',
                )}
              >
                <span className="min-w-0 flex-1 truncate">
                  {activity.name}
                  {archived && (
                    <span className="ml-2 text-xs text-muted-foreground">(arquivada)</span>
                  )}
                </span>
                <span
                  className="font-hud text-xs text-xp tabular-nums"
                  title="Peso do XP"
                  aria-label={`Peso do XP ${formatWeight(activity.xpWeight)}`}
                >
                  {formatWeight(activity.xpWeight)}
                </span>
                {!readOnly &&
                  (archived ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={`Restaurar atividade ${activity.name}`}
                      disabled={pending}
                      onClick={() => restore(activity)}
                    >
                      <ArchiveRestore aria-hidden className="size-3.5" />
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={`Editar atividade ${activity.name}`}
                        disabled={pending}
                        onClick={() => setDialog({ open: true, activity })}
                      >
                        <Pencil aria-hidden className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={`Arquivar atividade ${activity.name}`}
                        disabled={pending}
                        onClick={() => archiveWithUndo(activity)}
                      >
                        <Archive aria-hidden className="size-3.5" />
                      </Button>
                    </>
                  ))}
              </li>
            );
          })}
        </ul>
      )}

      <ActivityFormDialog
        open={dialog.open}
        area={area}
        activity={dialog.activity}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
      />
    </div>
  );
}
