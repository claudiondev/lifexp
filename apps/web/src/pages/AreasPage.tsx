import { Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { Area } from '@lifexp/shared';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { AreaCard } from '@/features/areas/AreaCard';
import { AreaFormDialog } from '@/features/areas/AreaFormDialog';
import { useAreaMutations, useAreas } from '@/features/areas/useAreas';
import { PageHeader } from './PageHeader';

export function AreasPage() {
  const [showArchived, setShowArchived] = useState(false);
  const [dialog, setDialog] = useState<{ open: boolean; area: Area | null }>({
    open: false,
    area: null,
  });
  const areas = useAreas(showArchived);
  const { archive, unarchive } = useAreaMutations();
  const pending = archive.isPending || unarchive.isPending;

  const restore = (area: Area) =>
    unarchive.mutate(area.id, {
      onSuccess: () => toast.success(`Área “${area.name}” restaurada`),
      onError: (error) => toast.error(error.message),
    });

  const archiveWithUndo = (area: Area) =>
    archive.mutate(area.id, {
      onSuccess: () =>
        toast.success(`Área “${area.name}” arquivada`, {
          description: 'O histórico foi preservado.',
          action: { label: 'Desfazer', onClick: () => restore(area) },
        }),
      onError: (error) => toast.error(error.message),
    });

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <PageHeader
        eyebrow="Atributos do personagem"
        title="Áreas da vida"
        description="Cada área é um atributo: o tempo que você investe nela faz o personagem evoluir."
        actions={
          <Button onClick={() => setDialog({ open: true, area: null })}>
            <Plus aria-hidden className="size-4" />
            Nova área
          </Button>
        }
      />

      <div className="mt-6 flex items-center gap-3">
        <Switch
          id="show-archived"
          checked={showArchived}
          onCheckedChange={setShowArchived}
          aria-label="Mostrar arquivadas"
        />
        <label htmlFor="show-archived" className="text-sm text-muted-foreground">
          Mostrar arquivadas
        </label>
      </div>

      <section aria-label="Lista de áreas" className="mt-6">
        {areas.isPending && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                className="h-36 animate-pulse rounded-2xl border border-border bg-card/50"
              />
            ))}
          </div>
        )}

        {areas.isError && (
          <div
            role="alert"
            className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5"
          >
            <p className="text-destructive">Não foi possível carregar as áreas.</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => void areas.refetch()}
            >
              Tentar de novo
            </Button>
          </div>
        )}

        {areas.isSuccess && areas.data.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center">
            <p className="font-display text-xl font-bold">Nenhuma área ativa</p>
            <p className="mt-1 text-muted-foreground">
              Crie a primeira área ou mostre as arquivadas para restaurar uma.
            </p>
          </div>
        )}

        {areas.isSuccess && areas.data.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {areas.data.map((area) => (
              <AreaCard
                key={area.id}
                area={area}
                pending={pending}
                onEdit={(target) => setDialog({ open: true, area: target })}
                onArchive={archiveWithUndo}
                onRestore={restore}
              />
            ))}
          </div>
        )}
      </section>

      <AreaFormDialog
        open={dialog.open}
        area={dialog.area}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
      />
    </main>
  );
}
