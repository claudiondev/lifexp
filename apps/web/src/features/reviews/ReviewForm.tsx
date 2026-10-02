import { REVIEW_TEXT_MAX, type WeeklyReview } from '@lifexp/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useServerError } from '../auth/useAuthForm';
import { useSaveReview } from './useReviews';

const QUESTIONS = [
  {
    field: 'wins',
    label: 'O que deu certo?',
    hint: 'Conquistas, hábitos que funcionaram, o que você quer repetir.',
  },
  {
    field: 'blockers',
    label: 'O que travou?',
    hint: 'Sem culpa: o que atrapalhou e o que você aprendeu com isso.',
  },
  {
    field: 'nextPriority',
    label: 'Qual a prioridade da próxima semana?',
    hint: 'Uma coisa que, se der certo, já faz a semana valer.',
  },
] as const;

type Values = { wins: string; blockers: string; nextPriority: string };

const EMPTY: Values = { wins: '', blockers: '', nextPriority: '' };

const fromReview = (review: WeeklyReview | null): Values =>
  review
    ? { wins: review.wins, blockers: review.blockers, nextPriority: review.nextPriority }
    : EMPTY;

/** A reflexão guiada da semana (RF46): três perguntas, salvas por botão. */
export function ReviewForm({
  weekStart,
  review,
}: {
  weekStart: string;
  review: WeeklyReview | null;
}) {
  const save = useSaveReview(weekStart);
  const { serverError, run } = useServerError();
  const saved = fromReview(review);
  const [values, setValues] = useState<Values>(saved);
  const dirty = QUESTIONS.some(({ field }) => values[field].trim() !== saved[field]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await save.mutateAsync(values);
      toast.success('Revisão salva');
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      {QUESTIONS.map(({ field, label, hint }) => (
        <div key={field} className="flex flex-col gap-1.5">
          <Label htmlFor={`review-${field}`}>{label}</Label>
          <p id={`review-${field}-hint`} className="text-sm text-muted-foreground">
            {hint}
          </p>
          <Textarea
            id={`review-${field}`}
            aria-describedby={`review-${field}-hint`}
            maxLength={REVIEW_TEXT_MAX}
            value={values[field]}
            onChange={(event) =>
              setValues((current) => ({ ...current, [field]: event.target.value }))
            }
          />
          <span className="self-end font-hud text-xs text-muted-foreground tabular-nums">
            {values[field].length}/{REVIEW_TEXT_MAX}
          </span>
        </div>
      ))}
      {serverError && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {serverError}
        </p>
      )}
      <div className="flex items-center justify-end gap-3">
        {!dirty && review && <span className="text-sm text-muted-foreground">Tudo salvo</span>}
        <Button type="submit" disabled={save.isPending || !dirty}>
          {save.isPending ? 'Salvando...' : 'Salvar revisão'}
        </Button>
      </div>
    </form>
  );
}
