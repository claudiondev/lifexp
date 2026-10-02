import { describe, expect, it } from 'vitest';
import { addTags, linkText, shortDate } from './noteFormat';
import { newNoteUrl } from './noteLinks';

describe('addTags', () => {
  it('normaliza o que foi digitado', () => {
    expect(addTags([], '#Saúde Mental')).toEqual({ ok: true, tags: ['saúde-mental'] });
    expect(addTags(['a'], '  TRABALHO ')).toEqual({ ok: true, tags: ['a', 'trabalho'] });
  });

  it('vírgulas separam várias tags de uma vez', () => {
    expect(addTags([], 'a, b ,c')).toEqual({ ok: true, tags: ['a', 'b', 'c'] });
    expect(addTags([], ' , ,')).toEqual({ ok: true, tags: [] });
  });

  it('repetida é ignorada, sem erro', () => {
    expect(addTags(['a', 'b'], 'B, #a, c')).toEqual({ ok: true, tags: ['a', 'b', 'c'] });
  });

  it('tag inválida recusa tudo e explica', () => {
    expect(addTags(['a'], 'bom, ruim!')).toEqual({
      ok: false,
      message: 'Use só letras, números, "-" e "_"',
    });
    const long = addTags([], 'x'.repeat(31));
    expect(long).toEqual({ ok: false, message: expect.stringContaining('30 caracteres') });
  });

  it('respeita o limite de 10 tags', () => {
    const ten = Array.from({ length: 10 }, (_, i) => `t${i}`);
    expect(addTags(ten, 'extra')).toEqual({ ok: false, message: 'No máximo 10 tags' });
    expect(addTags(ten, 't3')).toEqual({ ok: true, tags: ten }); // repetida não conta
  });

  it('não altera a lista recebida', () => {
    const current = ['a'];
    addTags(current, 'b');
    expect(current).toEqual(['a']);
  });
});

describe('linkText', () => {
  it('tipo e nome do alvo', () => {
    expect(linkText({ type: 'goal', label: 'Escrever o livro' })).toBe('Meta: Escrever o livro');
    expect(linkText({ type: 'area', label: 'Saúde' })).toBe('Área: Saúde');
    expect(linkText({ type: 'event', label: 'Consulta' })).toBe('Evento: Consulta');
    expect(linkText({ type: 'block', label: 'Corrida' })).toBe('Bloco: Corrida');
  });
});

describe('shortDate', () => {
  it('dia e mês no fuso da pessoa, sem ponto', () => {
    expect(shortDate('2026-10-07T15:00:00.000Z', 'America/Sao_Paulo')).toBe('7 out');
    // 02:30 UTC de 8/10 ainda é dia 7 em São Paulo e já é dia 8 em Tóquio
    expect(shortDate('2026-10-08T02:30:00.000Z', 'America/Sao_Paulo')).toBe('7 out');
    expect(shortDate('2026-10-08T02:30:00.000Z', 'Asia/Tokyo')).toBe('8 out');
    expect(shortDate('2026-09-01T12:00:00.000Z', 'UTC')).toBe('1 set');
  });
});

describe('newNoteUrl', () => {
  it('leva o alvo e o nome para o editor, com o nome codificado', () => {
    const id = '0192f1a0-7b3c-7000-8000-0000000000a1';
    expect(newNoteUrl('goal', id, 'Ler & escrever')).toBe(
      `/notas/nova?goalId=${id}&rotulo=Ler+%26+escrever`,
    );
    expect(newNoteUrl('event', id, 'x')).toContain('eventId=');
    expect(newNoteUrl('block', id, 'x')).toContain('blockId=');
    expect(newNoteUrl('area', id, 'x')).toContain('areaId=');
  });
});
