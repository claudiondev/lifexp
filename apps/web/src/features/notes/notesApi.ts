import {
  noteSchema,
  notePageSchema,
  tagListSchema,
  type CreateNoteInput,
  type Note,
  type NotePage,
  type TagCount,
  type UpdateNoteInput,
} from '@lifexp/shared';
import { apiFetch, apiJson } from '../../lib/apiClient';

export const NOTES_PAGE_SIZE = 20;

export interface NoteFilters {
  q?: string | undefined;
  tag?: string | undefined;
  goalId?: string | undefined;
  eventId?: string | undefined;
  blockId?: string | undefined;
  areaId?: string | undefined;
}

export function listNotes(filters: NoteFilters, cursor?: string): Promise<NotePage> {
  const params = new URLSearchParams({ limit: String(NOTES_PAGE_SIZE) });
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  if (cursor) params.set('before', cursor);
  return apiJson(`/notes?${params.toString()}`, notePageSchema);
}

export const listTags = (): Promise<TagCount[]> => apiJson('/notes/tags', tagListSchema);
export const getNote = (id: string): Promise<Note> => apiJson(`/notes/${id}`, noteSchema);
export const createNote = (input: CreateNoteInput): Promise<Note> =>
  apiJson('/notes', noteSchema, { method: 'POST', json: input });
export const updateNote = (id: string, input: UpdateNoteInput): Promise<Note> =>
  apiJson(`/notes/${id}`, noteSchema, { method: 'PATCH', json: input });
export async function deleteNote(id: string): Promise<void> {
  await apiFetch(`/notes/${id}`, { method: 'DELETE' });
}
