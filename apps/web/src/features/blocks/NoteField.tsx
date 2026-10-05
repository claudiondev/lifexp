import { BLOCK_NOTE_MAX } from '@lifexp/shared';
import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface NoteFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value'> {
  id: string;
  /** Texto atual (para o contador); o formulário é quem guarda o valor. */
  value: string;
  error?: string | undefined;
  /** Frase de apoio ao lado do contador; o padrão é a do bloco. */
  hint?: string;
}

/**
 * Anotação livre do bloco: texto puro, até 500 caracteres, igual em toda a série. O contador só
 * aparece perto do limite para não pesar no formulário.
 */
export const NoteField = forwardRef<HTMLTextAreaElement, NoteFieldProps>(function NoteField(
  { id, value, error, hint = 'Vale para todas as ocorrências deste bloco.', ...props },
  ref,
) {
  const left = BLOCK_NOTE_MAX - value.length;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Anotação (opcional)</Label>
      <Textarea
        id={id}
        ref={ref}
        rows={3}
        maxLength={BLOCK_NOTE_MAX}
        placeholder="Ex.: aula de inglês, levar o caderno"
        aria-invalid={error ? true : undefined}
        className="min-h-20"
        {...props}
      />
      <div className="flex justify-between gap-3 text-xs text-muted-foreground">
        <span>{hint}</span>
        <span aria-live="polite" className={left <= 50 ? 'text-foreground' : undefined}>
          {value.length}/{BLOCK_NOTE_MAX}
        </span>
      </div>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
});
