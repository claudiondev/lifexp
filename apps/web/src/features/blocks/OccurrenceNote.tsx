import { cn } from '@/lib/utils';

/**
 * Anotação do bloco como TEXTO (React escapa tudo; nunca markdown nem HTML). `clamp` limita a linhas nos
 * cartões; sem ele mostra a anotação inteira, preservando as quebras de linha.
 */
export function OccurrenceNote({
  note,
  clamp,
  className,
}: {
  note: string | null;
  clamp?: 1 | 2;
  className?: string;
}) {
  if (!note) return null;
  return (
    <p
      className={cn(
        'break-words text-muted-foreground',
        clamp === 1 && 'truncate',
        clamp === 2 && 'line-clamp-2',
        !clamp && 'whitespace-pre-wrap',
        className,
      )}
    >
      {note}
    </p>
  );
}
