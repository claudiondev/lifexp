import { escapeLike } from './search.js';

describe('escapeLike', () => {
  it('escapa os coringas % e _', () => {
    expect(escapeLike('100%')).toBe('100\\%');
    expect(escapeLike('nome_arquivo')).toBe('nome\\_arquivo');
    expect(escapeLike('%_%')).toBe('\\%\\_\\%');
  });

  it('escapa a própria barra de escape (senão ela escaparia o caractere seguinte)', () => {
    expect(escapeLike('a\\b')).toBe('a\\\\b');
    expect(escapeLike('\\%')).toBe('\\\\\\%');
  });

  it('não mexe em texto comum, acentos, aspas e emoji', () => {
    for (const text of ['relatório mensal', "d'Água", '"x"', '😀 ok', '', 'a-b.c']) {
      expect(escapeLike(text)).toBe(text);
    }
  });
});
