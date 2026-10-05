import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TASK_TITLE_MAX, type CivilDate } from '@lifexp/shared';
import { useTaskMutations } from './useTasks';

/**
 * Adicionar rápido: digita e Enter. Cria uma tarefa de prioridade média com o dia dado (hoje, em Hoje) ou sem dia
 * (em Pendentes). Os detalhes (prioridade, área, meta, anotação) ficam no formulário completo.
 */
export function QuickAddTask({ dueDate, label }: { dueDate: CivilDate | null; label: string }) {
  const { create } = useTaskMutations();
  const [title, setTitle] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || create.isPending) return;
    try {
      await create.mutateAsync({ title: trimmed, dueDate, priority: 'medium' });
      setTitle('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível criar a tarefa.');
    }
  };

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        aria-label={label}
        placeholder={label}
        autoComplete="off"
        maxLength={TASK_TITLE_MAX}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <Button type="submit" disabled={!title.trim() || create.isPending}>
        <Plus aria-hidden className="size-4" />
        Adicionar
      </Button>
    </form>
  );
}
