import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTES_PAGE,
  MAX_NOTES_PAGE,
  NOTE_CONTENT_MAX,
  NOTE_TAGS_MAX,
  NOTE_TITLE_MAX,
  TAG_MAX,
  createNoteSchema,
  listNotesQuerySchema,
  noteLinkInputSchema,
  notePageSchema,
  noteSchema,
  normalizeTag,
  tagCountSchema,
  tagSchema,
  tagsSchema,
  updateNoteSchema,
} from './note.schema.js';

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;
const id = '0192f1a0-7b3c-7000-8000-0000000000a1';

describe('normalizeTag', () => {
  it('minúsculas, sem "#" inicial e com hífen no lugar dos espaços', () => {
    expect(normalizeTag('Saúde')).toBe('saúde');
    expect(normalizeTag('  #Saúde Mental ')).toBe('saúde-mental');
    expect(normalizeTag('##projeto   x')).toBe('projeto-x');
    expect(normalizeTag('ÁRVORE')).toBe('árvore');
    expect(normalizeTag('# ')).toBe('');
    expect(normalizeTag('')).toBe('');
  });
});

describe('tagSchema', () => {
  it('aceita letras com acento, números, "-" e "_"', () => {
    for (const tag of ['trabalho', 'saúde-mental', 'ano_2026', 'ação', '2026', 'a']) {
      expect(ok(tagSchema, tag)).toBe(true);
    }
  });

  it('devolve a forma normalizada', () => {
    expect(tagSchema.parse('  #Saúde Mental ')).toBe('saúde-mental');
    expect(tagSchema.parse('TCC')).toBe('tcc');
  });

  it('recusa vazia, símbolos, começo com hífen e acima de 30 caracteres', () => {
    for (const tag of [
      '',
      '   ',
      '#',
      'a b!',
      'ola$',
      '-comeco',
      '_x',
      'a/b',
      '<script>',
      'x'.repeat(31),
    ]) {
      expect([tag, ok(tagSchema, tag)]).toEqual([tag, false]);
    }
    expect(ok(tagSchema, 'x'.repeat(TAG_MAX))).toBe(true);
    expect(ok(tagSchema, 5)).toBe(false);
  });
});

describe('tagsSchema', () => {
  it('normaliza e tira repetidas, mantendo a ordem da primeira ocorrência', () => {
    expect(tagsSchema.parse(['Saúde', 'trabalho', '#saúde', 'TRABALHO', 'x'])).toEqual([
      'saúde',
      'trabalho',
      'x',
    ]);
  });

  it('até 10 tags (contadas antes de tirar as repetidas, para não esconder abuso)', () => {
    const many = Array.from({ length: NOTE_TAGS_MAX }, (_, i) => `t${i}`);
    expect(ok(tagsSchema, many)).toBe(true);
    expect(ok(tagsSchema, [...many, 'extra'])).toBe(false);
  });

  it('uma tag inválida invalida o conjunto', () => {
    expect(ok(tagsSchema, ['ok', 'não pode!'])).toBe(false);
  });
});

describe('noteLinkInputSchema', () => {
  it('aceita os quatro tipos com um id UUID e recusa o resto', () => {
    for (const type of ['area', 'goal', 'event', 'block']) {
      expect(ok(noteLinkInputSchema, { type, id })).toBe(true);
    }
    expect(ok(noteLinkInputSchema, { type: 'note', id })).toBe(false);
    expect(ok(noteLinkInputSchema, { type: 'goal', id: '123' })).toBe(false);
    expect(ok(noteLinkInputSchema, { type: 'goal', id, label: 'x' })).toBe(false);
  });
});

describe('createNoteSchema', () => {
  it('só o título é obrigatório; o resto tem padrão', () => {
    expect(createNoteSchema.parse({ title: 'Ideias' })).toEqual({
      title: 'Ideias',
      content: '',
      tags: [],
      pinned: false,
    });
  });

  it('aceita tudo junto e normaliza as tags', () => {
    const parsed = createNoteSchema.parse({
      title: '  Reunião  ',
      content: '# Pauta\n- item',
      tags: ['Trabalho', '#trabalho'],
      pinned: true,
      link: { type: 'goal', id },
    });
    expect(parsed).toEqual({
      title: 'Reunião',
      content: '# Pauta\n- item',
      tags: ['trabalho'],
      pinned: true,
      link: { type: 'goal', id },
    });
  });

  it('não mexe nos espaços e quebras do conteúdo (fazem parte do markdown)', () => {
    const content = '  recuo\n\n```\ncódigo\n```\n';
    expect(createNoteSchema.parse({ title: 'x', content }).content).toBe(content);
  });

  it('título: obrigatório, sem ser só espaços, até 200 caracteres', () => {
    expect(ok(createNoteSchema, {})).toBe(false);
    expect(ok(createNoteSchema, { title: '' })).toBe(false);
    expect(ok(createNoteSchema, { title: '   ' })).toBe(false);
    expect(ok(createNoteSchema, { title: 'x'.repeat(NOTE_TITLE_MAX) })).toBe(true);
    expect(ok(createNoteSchema, { title: 'x'.repeat(NOTE_TITLE_MAX + 1) })).toBe(false);
  });

  it('conteúdo: até 20 mil caracteres', () => {
    expect(ok(createNoteSchema, { title: 'x', content: 'a'.repeat(NOTE_CONTENT_MAX) })).toBe(true);
    expect(ok(createNoteSchema, { title: 'x', content: 'a'.repeat(NOTE_CONTENT_MAX + 1) })).toBe(
      false,
    );
    expect(ok(createNoteSchema, { title: 'x', content: 5 })).toBe(false);
  });

  it('vínculo pode ser ausente ou nulo', () => {
    expect(ok(createNoteSchema, { title: 'x', link: null })).toBe(true);
    expect(ok(createNoteSchema, { title: 'x', link: { type: 'goal' } })).toBe(false);
  });

  it('rejeita campos extras (RS07): o dono nunca vem do corpo (RN39)', () => {
    expect(ok(createNoteSchema, { title: 'x', userId: 'outro' })).toBe(false);
    expect(ok(createNoteSchema, { title: 'x', id })).toBe(false);
    expect(ok(createNoteSchema, { title: 'x', createdAt: '2026-01-01T00:00:00.000Z' })).toBe(false);
  });
});

describe('updateNoteSchema', () => {
  it('aceita qualquer subconjunto de campos, inclusive desvincular com link nulo', () => {
    expect(ok(updateNoteSchema, { title: 'Novo' })).toBe(true);
    expect(ok(updateNoteSchema, { pinned: true })).toBe(true);
    expect(ok(updateNoteSchema, { content: '' })).toBe(true);
    expect(ok(updateNoteSchema, { tags: [] })).toBe(true);
    expect(updateNoteSchema.parse({ link: null })).toEqual({ link: null });
  });

  it('exige ao menos um campo', () => {
    expect(ok(updateNoteSchema, {})).toBe(false);
    expect(ok(updateNoteSchema, { title: undefined })).toBe(false);
  });

  it('as mesmas regras de título, conteúdo e tags da criação', () => {
    expect(ok(updateNoteSchema, { title: '   ' })).toBe(false);
    expect(ok(updateNoteSchema, { title: 'x'.repeat(NOTE_TITLE_MAX + 1) })).toBe(false);
    expect(ok(updateNoteSchema, { content: 'a'.repeat(NOTE_CONTENT_MAX + 1) })).toBe(false);
    expect(updateNoteSchema.parse({ tags: ['Saúde', '#saúde'] })).toEqual({ tags: ['saúde'] });
    expect(ok(updateNoteSchema, { pinned: 'sim' })).toBe(false);
  });

  it('rejeita campos extras (RS07)', () => {
    expect(ok(updateNoteSchema, { title: 'x', userId: 'outro' })).toBe(false);
    expect(ok(updateNoteSchema, { title: 'x', createdAt: '2026-01-01T00:00:00.000Z' })).toBe(false);
  });
});

describe('noteSchema e página', () => {
  const note = {
    id,
    title: 'Ideias',
    content: '# oi',
    tags: ['a'],
    pinned: false,
    link: { type: 'goal', id, label: 'Escrever o livro' },
    createdAt: '2026-10-07T12:00:00.000Z',
    updatedAt: '2026-10-07T12:00:00.000Z',
  };

  it('aceita a nota com e sem vínculo', () => {
    expect(ok(noteSchema, note)).toBe(true);
    expect(ok(noteSchema, { ...note, link: null })).toBe(true);
    expect(ok(noteSchema, { ...note, createdAt: 'ontem' })).toBe(false);
  });

  it('a página traz itens SEM o texto completo, só um trecho', () => {
    const item = {
      ...Object.fromEntries(Object.entries(note).filter(([key]) => key !== 'content')),
      excerpt: 'oi',
    };
    expect(ok(notePageSchema, { items: [item], nextCursor: 'abc' })).toBe(true);
    expect(ok(notePageSchema, { items: [], nextCursor: null })).toBe(true);
    const parsed = notePageSchema.parse({
      items: [{ ...item, content: 'segredo' }],
      nextCursor: null,
    });
    expect(parsed.items[0]).not.toHaveProperty('content');
  });

  it('contagem de tags é de pelo menos 1', () => {
    expect(ok(tagCountSchema, { tag: 'a', count: 3 })).toBe(true);
    expect(ok(tagCountSchema, { tag: 'a', count: 0 })).toBe(false);
  });
});

describe('listNotesQuerySchema', () => {
  it('sem parâmetros: página padrão', () => {
    expect(listNotesQuerySchema.parse({})).toEqual({ limit: DEFAULT_NOTES_PAGE });
  });

  it('busca aparada, tag normalizada e limite convertido da query string', () => {
    expect(listNotesQuerySchema.parse({ q: '  relatório ', tag: '#Saúde', limit: '5' })).toEqual({
      q: 'relatório',
      tag: 'saúde',
      limit: 5,
    });
  });

  it('limite de 1 a 50', () => {
    expect(ok(listNotesQuerySchema, { limit: String(MAX_NOTES_PAGE) })).toBe(true);
    expect(ok(listNotesQuerySchema, { limit: String(MAX_NOTES_PAGE + 1) })).toBe(false);
    expect(ok(listNotesQuerySchema, { limit: '0' })).toBe(false);
    expect(ok(listNotesQuerySchema, { limit: 'abc' })).toBe(false);
  });

  it('busca de até 100 caracteres; tag inválida e cursor com caracteres estranhos são recusados', () => {
    expect(ok(listNotesQuerySchema, { q: 'x'.repeat(100) })).toBe(true);
    expect(ok(listNotesQuerySchema, { q: 'x'.repeat(101) })).toBe(false);
    expect(ok(listNotesQuerySchema, { tag: 'a b!' })).toBe(false);
    expect(ok(listNotesQuerySchema, { before: 'abc_DEF-123' })).toBe(true);
    expect(ok(listNotesQuerySchema, { before: 'a b' })).toBe(false);
    expect(ok(listNotesQuerySchema, { before: "'; DROP TABLE" })).toBe(false);
    expect(ok(listNotesQuerySchema, { before: 'x'.repeat(201) })).toBe(false);
  });

  it('filtra por no máximo um vínculo, e o id é UUID', () => {
    for (const key of ['areaId', 'goalId', 'eventId', 'blockId']) {
      expect(ok(listNotesQuerySchema, { [key]: id })).toBe(true);
      expect(ok(listNotesQuerySchema, { [key]: '123' })).toBe(false);
    }
    expect(ok(listNotesQuerySchema, { goalId: id, eventId: id })).toBe(false);
    expect(ok(listNotesQuerySchema, { goalId: id, tag: 'a', q: 'x' })).toBe(true);
  });
});
