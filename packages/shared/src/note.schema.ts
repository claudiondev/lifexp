import { z } from 'zod';

export const NOTE_TITLE_MAX = 200;
/** Cerca de 10 páginas de texto: sobra para uma nota, e protege o banco e a renderização. */
export const NOTE_CONTENT_MAX = 20_000;
export const NOTE_TAGS_MAX = 10;
export const TAG_MAX = 30;
/** Fixar é para o que é importante AGORA: com 20 fixadas, nenhuma se destaca mais. */
export const MAX_PINNED_NOTES = 20;
export const NOTE_SEARCH_MAX = 100;
export const DEFAULT_NOTES_PAGE = 20;
export const MAX_NOTES_PAGE = 50;

const TAG_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u;

/**
 * Forma canônica de uma tag: minúsculas, sem "#" inicial, espaços viram "-". "  #Saúde Mental " vira
 * "saúde-mental". Não valida: o resultado pode ser inválido (vazio, símbolos) e `tagSchema` decide.
 */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#+/, '').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, '-');
}

/** Letras (com acento) e números, "-" e "_" no meio; até 30 caracteres. */
export const tagSchema = z
  .string()
  .transform(normalizeTag)
  .pipe(
    z
      .string()
      .min(1, 'Informe a tag')
      .max(TAG_MAX, `A tag deve ter no máximo ${TAG_MAX} caracteres`)
      .regex(TAG_PATTERN, 'Use só letras, números, "-" e "_"'),
  );

/** Até 10 tags, sem repetir (a primeira ocorrência vale, na ordem em que vieram). */
export const tagsSchema = z
  .array(tagSchema)
  .max(NOTE_TAGS_MAX, `No máximo ${NOTE_TAGS_MAX} tags`)
  .transform((tags) => [...new Set(tags)]);

export const NOTE_LINK_TYPES = ['area', 'goal', 'event', 'block'] as const;
export const noteLinkTypeSchema = z.enum(NOTE_LINK_TYPES);

/** O que se envia para vincular: o tipo e o id. A API confere que o alvo é da própria pessoa. */
export const noteLinkInputSchema = z.strictObject({ type: noteLinkTypeSchema, id: z.uuid() });

/** O que se recebe: o vínculo com o nome do alvo (para mostrar sem outra chamada). */
export const noteLinkSchema = z.object({
  type: noteLinkTypeSchema,
  id: z.uuid(),
  label: z.string(),
});

const titleSchema = z
  .string()
  .trim()
  .min(1, 'Dê um título à nota')
  .max(NOTE_TITLE_MAX, `O título deve ter no máximo ${NOTE_TITLE_MAX} caracteres`);
// Sem trim: o espaço e a quebra de linha fazem parte do markdown (listas, blocos de código).
const contentSchema = z
  .string()
  .max(NOTE_CONTENT_MAX, `A nota deve ter no máximo ${NOTE_CONTENT_MAX} caracteres`);

// strictObject: campos desconhecidos viram erro 400 (RS07); o dono nunca vem do corpo (RN39).
export const createNoteSchema = z.strictObject({
  title: titleSchema,
  content: contentSchema.default(''),
  tags: tagsSchema.default([]),
  pinned: z.boolean().default(false),
  link: noteLinkInputSchema.nullish(),
});

export const updateNoteSchema = z
  .strictObject({
    title: titleSchema,
    content: contentSchema,
    tags: tagsSchema,
    pinned: z.boolean(),
    /** Nulo desvincula a nota. */
    link: noteLinkInputSchema.nullable(),
  })
  .partial()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Informe ao menos um campo para alterar',
  });

export const noteSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
  pinned: z.boolean(),
  link: noteLinkSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** Na lista não vai o texto todo (pode ser longo): só um trecho, para reconhecer a nota. */
export const noteListItemSchema = noteSchema
  .omit({ content: true })
  .extend({ excerpt: z.string() });

/** O cursor é opaco (o cliente só o devolve como veio); o formato é problema da API. */
const cursorSchema = z
  .string()
  .max(200)
  .regex(/^[A-Za-z0-9_-]+$/, 'Cursor inválido');

const FILTER_KEYS = ['areaId', 'goalId', 'eventId', 'blockId'] as const;

/** Fixadas primeiro e depois as mais recentemente alteradas (RNF08: paginado por cursor). */
export const listNotesQuerySchema = z
  .object({
    /** Busca no título e no texto, sem diferenciar maiúsculas. */
    q: z.string().trim().max(NOTE_SEARCH_MAX).optional(),
    tag: tagSchema.optional(),
    areaId: z.uuid().optional(),
    goalId: z.uuid().optional(),
    eventId: z.uuid().optional(),
    blockId: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(MAX_NOTES_PAGE).default(DEFAULT_NOTES_PAGE),
    before: cursorSchema.optional(),
  })
  .refine((query) => FILTER_KEYS.filter((key) => query[key] !== undefined).length <= 1, {
    message: 'Filtre por no máximo um vínculo',
  });

export const notePageSchema = z.object({
  items: z.array(noteListItemSchema),
  nextCursor: z.string().nullable(),
});

export const tagCountSchema = z.object({ tag: z.string(), count: z.number().int().min(1) });
export const tagListSchema = z.array(tagCountSchema);

export type NoteLinkType = z.infer<typeof noteLinkTypeSchema>;
export type NoteLinkInput = z.infer<typeof noteLinkInputSchema>;
export type NoteLink = z.infer<typeof noteLinkSchema>;
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
export type Note = z.infer<typeof noteSchema>;
export type NoteListItem = z.infer<typeof noteListItemSchema>;
export type ListNotesQuery = z.infer<typeof listNotesQuerySchema>;
export type NotePage = z.infer<typeof notePageSchema>;
export type TagCount = z.infer<typeof tagCountSchema>;
