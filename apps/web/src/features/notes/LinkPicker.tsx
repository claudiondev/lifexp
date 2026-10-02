import { addDays, todayIn, type NoteLinkInput, type NoteLinkType } from '@lifexp/shared';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useAreas } from '../areas/useAreas';
import { useAuth } from '../auth/useAuth';
import { useEvents } from '../events/useEvents';
import { useGoalList } from '../goals/useGoals';
import { LINK_TYPE_LABEL } from './noteFormat';

/** Eventos oferecidos para vincular: do último mês aos próximos dois (cabe nas 93 dias que a API aceita). */
const PAST_DAYS = 30;
const FUTURE_DAYS = 60;

interface LinkPickerProps {
  value: NoteLinkInput | null;
  /** O nome do alvo já vinculado (a nota salva ou o atalho que abriu o editor): aparece mesmo fora das listas. */
  currentLabel: string | null;
  onChange: (value: NoteLinkInput | null) => void;
}

/**
 * Vínculo opcional da nota (RF44): uma área, meta ou evento. O vínculo com um BLOCO nasce no atalho
 * "Anotar" da ocorrência e aqui só se vê (e se remove): não há uma lista de blocos para escolher.
 */
export function LinkPicker({ value, currentLabel, onChange }: LinkPickerProps) {
  const { state } = useAuth();
  const timezone = state.status === 'authenticated' ? state.user.timezone : 'UTC';
  const today = todayIn(timezone);
  const areas = useAreas(false);
  const goals = useGoalList();
  const events = useEvents(addDays(today, -PAST_DAYS), addDays(today, FUTURE_DAYS));

  if (value?.type === 'block') {
    return (
      <div className="flex flex-col gap-1.5">
        <Label>Vínculo</Label>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/60 px-3.5 py-2.5 text-sm">
          <span>Bloco: {currentLabel ?? 'vinculado'}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Remover o vínculo com o bloco"
            onClick={() => onChange(null)}
          >
            <X aria-hidden className="size-4" />
            Remover
          </Button>
        </div>
      </div>
    );
  }

  const options: Record<'area' | 'goal' | 'event', { id: string; label: string }[]> = {
    area: (areas.data ?? []).map((area) => ({ id: area.id, label: area.name })),
    goal: (goals.data ?? []).map((goal) => ({ id: goal.id, label: goal.title })),
    event: (events.data ?? []).map((event) => ({ id: event.id, label: event.title })),
  };
  const type = value?.type as Exclude<NoteLinkType, 'block'> | undefined;
  const list = type ? [...options[type]] : [];
  // O alvo já vinculado continua escolhível, mesmo que tenha saído da lista (meta concluída, evento antigo).
  if (type && value && !list.some((option) => option.id === value.id) && currentLabel) {
    list.unshift({ id: value.id, label: currentLabel });
  }

  const changeType = (next: string) => {
    if (!next) onChange(null);
    else onChange({ type: next as Exclude<NoteLinkType, 'block'>, id: '' });
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="note-link-type">Vínculo</Label>
        <Select
          id="note-link-type"
          value={type ?? ''}
          onChange={(event) => changeType(event.target.value)}
        >
          <option value="">Sem vínculo</option>
          {(['area', 'goal', 'event'] as const).map((item) => (
            <option key={item} value={item}>
              {LINK_TYPE_LABEL[item]}
            </option>
          ))}
        </Select>
      </div>
      {type && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="note-link-target">{LINK_TYPE_LABEL[type]}</Label>
          <Select
            id="note-link-target"
            value={value?.id ?? ''}
            onChange={(event) => onChange({ type, id: event.target.value })}
          >
            <option value="">Escolha…</option>
            {list.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      )}
    </div>
  );
}
