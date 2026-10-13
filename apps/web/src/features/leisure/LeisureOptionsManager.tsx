import { Archive, ArchiveRestore, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { LeisureOption } from '@lifexp/shared';
import { Button } from '@/components/ui/button';
import { LeisureIconView } from './leisureAppearance';
import { LeisureOptionDialog } from './LeisureOptionDialog';
import { useLeisureMutations, useLeisureOptions } from './useLeisure';

/** Os lazeres que a pessoa cadastrou: criar, renomear, trocar o ícone, arquivar e restaurar (nunca excluir). */
export function LeisureOptionsManager() {
  const query = useLeisureOptions(true);
  const { update } = useLeisureMutations();
  const [dialog, setDialog] = useState<{ open: boolean; option: LeisureOption | null }>({
    open: false,
    option: null,
  });

  const setArchived = (option: LeisureOption, archived: boolean) =>
    update.mutate(
      { id: option.id, input: { archived } },
      {
        onSuccess: () =>
          toast.success(
            archived ? `Lazer “${option.name}” arquivado` : `Lazer “${option.name}” restaurado`,
          ),
        onError: (error) => toast.error(error.message),
      },
    );

  const options = query.data ?? [];
  const active = options.filter((option) => option.archivedAt === null);
  const archived = options.filter((option) => option.archivedAt !== null);

  return (
    <section
      aria-label="Seus lazeres"
      className="rounded-2xl border border-border bg-card/80 p-4 sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold">Seus lazeres</h2>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setDialog({ open: true, option: null })}
        >
          <Plus aria-hidden className="size-4" />
          Novo lazer
        </Button>
      </div>

      {query.isError && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          Não foi possível carregar os lazeres.
        </p>
      )}

      {query.data && active.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          Nenhum lazer cadastrado. Cadastre o que você gosta de fazer para gastar o tempo que
          conquistar.
        </p>
      )}

      {active.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {active.map((option) => (
            <li key={option.id} className="flex items-center gap-3 rounded-lg py-1 pl-2 text-sm">
              <LeisureIconView icon={option.icon} className="size-4 text-mana" />
              <span className="min-w-0 flex-1 truncate">{option.name}</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={`Editar lazer ${option.name}`}
                onClick={() => setDialog({ open: true, option })}
              >
                <Pencil aria-hidden className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={`Arquivar lazer ${option.name}`}
                disabled={update.isPending}
                onClick={() => setArchived(option, true)}
              >
                <Archive aria-hidden className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <h3 className="font-hud text-xs tracking-wider text-muted-foreground uppercase">
            Arquivados
          </h3>
          <ul className="mt-2 flex flex-col gap-1">
            {archived.map((option) => (
              <li
                key={option.id}
                className="flex items-center gap-3 rounded-lg py-1 pl-2 text-sm opacity-70"
              >
                <LeisureIconView icon={option.icon} className="size-4" />
                <span className="min-w-0 flex-1 truncate">{option.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={`Restaurar lazer ${option.name}`}
                  disabled={update.isPending}
                  onClick={() => setArchived(option, false)}
                >
                  <ArchiveRestore aria-hidden className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <LeisureOptionDialog
        open={dialog.open}
        onOpenChange={(open) => {
          if (!open) setDialog({ open: false, option: null });
        }}
        option={dialog.option}
      />
    </section>
  );
}
