import { X } from 'lucide-react';
import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { addTags } from './noteFormat';
import { useNoteTags } from './useNotes';

interface TagsInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
}

/** Tags da nota (RF43): digite e aperte Enter ou vírgula; as já usadas aparecem como sugestão. */
export function TagsInput({ tags, onChange }: TagsInputProps) {
  const id = useId();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const known = useNoteTags();

  const commit = (text: string) => {
    if (!text.trim()) return;
    const result = addTags(tags, text);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    onChange(result.tags);
    setTyped('');
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Tags</Label>
      {tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Tags da nota">
          {tags.map((tag) => (
            <li
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-secondary py-0.5 pr-1 pl-2.5 text-sm"
            >
              #{tag}
              <button
                type="button"
                aria-label={`Remover a tag ${tag}`}
                onClick={() => onChange(tags.filter((item) => item !== tag))}
                className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                <X aria-hidden className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input
        id={id}
        value={typed}
        list={`${id}-known`}
        placeholder="ex.: trabalho, ideias"
        aria-invalid={error ? true : undefined}
        onChange={(event) => {
          const value = event.target.value;
          // vírgula fecha a tag (colar "a, b, c" também funciona)
          if (value.includes(',')) commit(value);
          else setTyped(value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit(typed);
          }
        }}
        onBlur={() => commit(typed)}
      />
      <datalist id={`${id}-known`}>
        {(known.data ?? [])
          .filter((item) => !tags.includes(item.tag))
          .map((item) => (
            <option key={item.tag} value={item.tag} />
          ))}
      </datalist>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}
