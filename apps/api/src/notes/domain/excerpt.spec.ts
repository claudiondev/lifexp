import { EXCERPT_LENGTH, makeExcerpt } from './excerpt.js';

describe('makeExcerpt', () => {
  it('texto curto sai como está, só com os espaços compactados', () => {
    expect(makeExcerpt('Comprar pão')).toBe('Comprar pão');
    expect(makeExcerpt('  a   b\n\n c  ')).toBe('a b c');
    expect(makeExcerpt('')).toBe('');
  });

  it('tira a sintaxe de markdown mais comum', () => {
    expect(makeExcerpt('# Título\n\n**negrito** e _itálico_ e `código`')).toBe(
      'Título negrito e itálico e código',
    );
    expect(makeExcerpt('- um\n- dois\n1. três')).toBe('um dois três');
    expect(makeExcerpt('> citação')).toBe('citação');
    expect(makeExcerpt('~~riscado~~')).toBe('riscado');
  });

  it('links e imagens viram só o texto; blocos de código somem', () => {
    expect(makeExcerpt('veja [o site](https://exemplo.com/x) agora')).toBe('veja o site agora');
    expect(makeExcerpt('![foto da praia](http://x/y.png) legenda')).toBe('foto da praia legenda');
    expect(makeExcerpt('antes\n```js\nconst segredo = 1;\n```\ndepois')).toBe('antes depois');
  });

  it('nunca devolve a URL de um link (não vaza o destino na lista)', () => {
    expect(makeExcerpt('[x](https://exemplo.com/token=abc)')).not.toContain('exemplo.com');
  });

  it('corta no limite, com reticências, e não passa dele', () => {
    const long = 'a'.repeat(500);
    const excerpt = makeExcerpt(long);
    expect(Array.from(excerpt)).toHaveLength(EXCERPT_LENGTH + 1);
    expect(excerpt.endsWith('…')).toBe(true);
    expect(makeExcerpt('a'.repeat(EXCERPT_LENGTH))).toBe('a'.repeat(EXCERPT_LENGTH)); // exatamente no limite: inteiro
  });

  it('não corta um emoji no meio', () => {
    const text = '😀'.repeat(200);
    const excerpt = makeExcerpt(text, 10);
    expect(excerpt).toBe(`${'😀'.repeat(10)}…`);
    expect(excerpt).not.toContain('�');
  });

  it('não deixa espaço antes das reticências', () => {
    expect(makeExcerpt('palavra '.repeat(40), 8)).toBe('palavra…');
  });
});
