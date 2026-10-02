import { Gift, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { Reward } from '@lifexp/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { RewardFormDialog } from '@/features/rewards/RewardFormDialog';
import { describeTrigger, groupByStatus } from '@/features/rewards/rewardModel';
import { useRewardMutations, useRewards } from '@/features/rewards/useRewards';
import { cn } from '@/lib/utils';
import { PageHeader } from './PageHeader';

const REDEEMED_AT = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' });

function RewardRow({
  reward,
  busy,
  onRedeem,
  onEdit,
  onDelete,
}: {
  reward: Reward;
  busy: boolean;
  onRedeem: (reward: Reward) => void;
  onEdit: (reward: Reward) => void;
  onDelete: (reward: Reward) => void;
}) {
  return (
    <li
      className={cn(
        'flex items-start gap-3 rounded-2xl border bg-card/80 p-4 backdrop-blur',
        reward.status === 'available' ? 'border-xp/60' : 'border-border',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-secondary',
          reward.status === 'available' ? 'text-xp' : 'text-muted-foreground',
        )}
      >
        <Gift className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-lg leading-tight font-bold">{reward.title}</h3>
        <p className="text-sm text-muted-foreground">{describeTrigger(reward.trigger)}</p>
        {reward.description && <p className="mt-1 text-sm">{reward.description}</p>}
        {reward.status === 'redeemed' && reward.redeemedAt && (
          <p className="mt-1 text-xs text-muted-foreground">
            Resgatada em {REDEEMED_AT.format(new Date(reward.redeemedAt))}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {reward.status === 'available' && (
          <Button size="sm" disabled={busy} onClick={() => onRedeem(reward)}>
            Resgatar
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Editar ${reward.title}`}
          onClick={() => onEdit(reward)}
        >
          <Pencil aria-hidden className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Excluir ${reward.title}`}
          onClick={() => onDelete(reward)}
        >
          <Trash2 aria-hidden className="size-4" />
        </Button>
      </div>
    </li>
  );
}

export function RewardsPage() {
  const rewards = useRewards();
  const { redeem, remove } = useRewardMutations();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Reward | null>(null);
  const [deleting, setDeleting] = useState<Reward | null>(null);

  const fail = (error: unknown) =>
    toast.error(error instanceof Error ? error.message : 'Algo deu errado. Tente de novo.');

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (reward: Reward) => {
    setEditing(reward);
    setFormOpen(true);
  };
  const handleRedeem = (reward: Reward) =>
    redeem.mutate(reward.id, {
      onSuccess: () =>
        toast.success(`“${reward.title}” resgatada`, { description: 'Aproveite, você merece!' }),
      onError: fail,
    });
  const handleDelete = () => {
    if (!deleting) return;
    remove.mutate(deleting.id, {
      onSuccess: () => {
        toast.success('Recompensa excluída');
        setDeleting(null);
      },
      onError: fail,
    });
  };

  const groups = groupByStatus(rewards.data ?? []);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <PageHeader
        eyebrow="Prêmios de verdade"
        title="Recompensas"
        description="Cadastre um prêmio que você se dá ao chegar a um nível, a um streak, a um total de XP ou a uma conquista. O resgate é sempre decisão sua."
        actions={
          <Button onClick={openCreate}>
            <Plus aria-hidden className="size-4" />
            Nova recompensa
          </Button>
        }
      />

      <div className="mt-8 flex flex-col gap-8">
        {rewards.isPending && (
          <div
            aria-busy="true"
            className="h-32 animate-pulse rounded-2xl border border-border bg-card/50"
          />
        )}
        {rewards.isError && (
          <div
            role="alert"
            className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5"
          >
            <p className="text-destructive">Não foi possível carregar as recompensas.</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => void rewards.refetch()}
            >
              Tentar de novo
            </Button>
          </div>
        )}
        {rewards.data && groups.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border bg-card/40 p-6 text-muted-foreground">
            Nenhuma recompensa ainda. Que tal combinar um jantar, um livro novo ou uma folga para
            quando você chegar ao nível 5?
          </p>
        )}
        {groups.map((group) => (
          <section key={group.status} aria-label={group.heading}>
            <h2 className="font-display text-xl font-bold">{group.heading}</h2>
            <ul className="mt-3 flex flex-col gap-3">
              {group.rewards.map((reward) => (
                <RewardRow
                  key={reward.id}
                  reward={reward}
                  busy={redeem.isPending}
                  onRedeem={handleRedeem}
                  onEdit={openEdit}
                  onDelete={setDeleting}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <RewardFormDialog open={formOpen} onOpenChange={setFormOpen} reward={editing} />

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogTitle>Excluir recompensa</DialogTitle>
          <DialogDescription>
            “{deleting?.title}” será removida. Esta ação não pode ser desfeita.
          </DialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={handleDelete}>
              Excluir recompensa
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
