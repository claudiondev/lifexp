import {
  ACHIEVEMENT_CATALOG,
  ACHIEVEMENT_KEYS,
  createRewardSchema,
  type AchievementKey,
  type Reward,
} from '@lifexp/shared';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { TextField } from '../auth/TextField';
import { useServerError } from '../auth/useAuthForm';
import { TRIGGER_TYPES, type TriggerType } from './rewardModel';
import { useRewardMutations } from './useRewards';

interface RewardFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sem recompensa: modo criação. Com recompensa: modo edição (só nome e descrição). */
  reward?: Reward | null;
}

export function RewardFormDialog({ open, onOpenChange, reward }: RewardFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* key: reinicia o formulário a cada abertura ou troca de recompensa. */}
        <RewardForm
          key={reward?.id ?? 'new'}
          reward={reward ?? null}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

const DEFAULT_THRESHOLD: Record<Exclude<TriggerType, 'achievement'>, string> = {
  level: '5',
  streak: '7',
  total_xp: '1000',
};

function RewardForm({ reward, onDone }: { reward: Reward | null; onDone: () => void }) {
  const { create, update } = useRewardMutations();
  const { serverError, run } = useServerError();
  const editing = reward !== null;

  const [title, setTitle] = useState(reward?.title ?? '');
  const [description, setDescription] = useState(reward?.description ?? '');
  const [type, setType] = useState<TriggerType>(reward?.trigger.type ?? 'level');
  const [threshold, setThreshold] = useState(
    reward && reward.trigger.type !== 'achievement'
      ? String(reward.trigger.threshold)
      : DEFAULT_THRESHOLD.level,
  );
  const [achievementKey, setAchievementKey] = useState<AchievementKey>(
    reward?.trigger.type === 'achievement' ? reward.trigger.achievementKey : ACHIEVEMENT_KEYS[0],
  );
  const [errors, setErrors] = useState<{ title?: string; threshold?: string }>({});

  const changeType = (next: TriggerType) => {
    setType(next);
    if (next !== 'achievement') setThreshold(DEFAULT_THRESHOLD[next]);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmedDescription = description.trim();
    if (reward) {
      void run(async () => {
        if (!title.trim()) {
          setErrors({ title: 'Informe o nome da recompensa' });
          return;
        }
        await update.mutateAsync({
          id: reward.id,
          input: { title, description: trimmedDescription === '' ? null : trimmedDescription },
        });
        toast.success('Recompensa atualizada');
        onDone();
      });
      return;
    }

    const parsed = createRewardSchema.safeParse({
      title,
      description: trimmedDescription === '' ? null : trimmedDescription,
      trigger:
        type === 'achievement' ? { type, achievementKey } : { type, threshold: Number(threshold) },
    });
    if (!parsed.success) {
      const issue = (path: string) => parsed.error.issues.find((i) => i.path.join('.') === path);
      setErrors({
        title: issue('title')?.message,
        threshold:
          issue('trigger.threshold')?.message && 'Informe um número inteiro dentro do limite',
      });
      return;
    }
    setErrors({});
    void run(async () => {
      await create.mutateAsync(parsed.data);
      toast.success(`Recompensa “${parsed.data.title}” criada`);
      onDone();
    });
  };

  const unit = TRIGGER_TYPES.find((entry) => entry.type === type)!.unit;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div>
        <DialogTitle>{editing ? 'Editar recompensa' : 'Nova recompensa'}</DialogTitle>
        <DialogDescription>
          {editing
            ? 'O gatilho não muda depois de criado. Para trocá-lo, exclua e crie outra.'
            : 'Um prêmio de verdade que você se dá ao atingir um marco no LifeXP.'}
        </DialogDescription>
      </div>

      <TextField
        label="Nome"
        autoComplete="off"
        placeholder="Ex.: Jantar no japonês"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        error={errors.title}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reward-description">Descrição (opcional)</Label>
        <Textarea
          id="reward-description"
          className="min-h-20"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      {!editing && (
        <fieldset className="flex flex-col gap-3">
          <Label asChild>
            <legend>Quando liberar</legend>
          </Label>
          <Select
            aria-label="Tipo de gatilho"
            value={type}
            onChange={(event) => changeType(event.target.value as TriggerType)}
          >
            {TRIGGER_TYPES.map((entry) => (
              <option key={entry.type} value={entry.type}>
                {entry.label}
              </option>
            ))}
          </Select>
          {type === 'achievement' ? (
            <Select
              aria-label="Conquista"
              value={achievementKey}
              onChange={(event) => setAchievementKey(event.target.value as AchievementKey)}
            >
              {ACHIEVEMENT_KEYS.map((key) => (
                <option key={key} value={key}>
                  {ACHIEVEMENT_CATALOG[key].title}
                </option>
              ))}
            </Select>
          ) : (
            <TextField
              label={unit}
              type="number"
              inputMode="numeric"
              min={1}
              value={threshold}
              onChange={(event) => setThreshold(event.target.value)}
              error={errors.threshold}
            />
          )}
        </fieldset>
      )}

      {serverError && (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={create.isPending || update.isPending}>
          {editing ? 'Salvar' : 'Criar recompensa'}
        </Button>
      </div>
    </form>
  );
}
