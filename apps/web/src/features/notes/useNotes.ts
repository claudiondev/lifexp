import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { UpdateNoteInput } from '@lifexp/shared';
import * as api from './notesApi';

export const notesKey = ['notes'] as const;

export function useNoteList(filters: api.NoteFilters) {
  return useInfiniteQuery({
    queryKey: [...notesKey, 'list', filters],
    queryFn: ({ pageParam }) => api.listNotes(filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useNote(id: string | undefined) {
  return useQuery({
    queryKey: [...notesKey, 'detail', id],
    queryFn: () => api.getNote(id!),
    enabled: id !== undefined,
  });
}

export function useNoteTags() {
  return useQuery({ queryKey: [...notesKey, 'tags'], queryFn: api.listTags });
}

export function useNoteMutations() {
  const queryClient = useQueryClient();
  // A lista, o detalhe e as tags dependem de qualquer mudança em qualquer nota.
  const refresh = () => queryClient.invalidateQueries({ queryKey: notesKey });
  return {
    create: useMutation({ mutationFn: api.createNote, onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: UpdateNoteInput }) =>
        api.updateNote(id, input),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: api.deleteNote, onSuccess: refresh }),
  };
}

/** O valor só muda depois de `delayMs` sem novas mudanças: a busca não dispara a cada tecla. */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
