import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownView } from './MarkdownView';
import { isWebLink, safeHref } from './safeUrl';

function renderMd(source: string) {
  return render(<MarkdownView source={source} />);
}

/** Tudo o que um ataque de XSS precisaria que existisse na página. */
function assertNoDangerousDom(container: HTMLElement) {
  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('iframe')).toBeNull();
  expect(container.querySelector('object')).toBeNull();
  expect(container.querySelector('embed')).toBeNull();
  expect(container.querySelector('svg')).toBeNull();
  expect(container.querySelector('style')).toBeNull();
  expect(container.querySelector('form')).toBeNull();
  expect(container.querySelector('img')).toBeNull();
  for (const element of container.querySelectorAll('*')) {
    for (const attribute of element.getAttributeNames()) {
      expect([element.tagName, attribute]).not.toEqual([
        element.tagName,
        expect.stringMatching(/^on/i),
      ]);
      expect(attribute).not.toBe('style');
      expect(attribute).not.toBe('srcdoc');
    }
  }
  for (const anchor of container.querySelectorAll('a')) {
    expect(anchor.getAttribute('href')).toMatch(/^(https?:\/\/|mailto:)/i);
  }
}

describe('safeHref', () => {
  it('só http, https e mailto', () => {
    expect(safeHref('https://exemplo.com/a?b=1#c')).toBe('https://exemplo.com/a?b=1#c');
    expect(safeHref('http://exemplo.com')).toBe('http://exemplo.com');
    expect(safeHref('HTTPS://EXEMPLO.COM')).toBe('HTTPS://EXEMPLO.COM');
    expect(safeHref('mailto:ana@exemplo.com')).toBe('mailto:ana@exemplo.com');
  });

  it('recusa os esquemas perigosos, em qualquer variação de letras', () => {
    for (const url of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'JAVASCRIPT:alert(1)',
      'vbscript:msgbox(1)',
      'data:text/html,<script>alert(1)</script>',
      'data:text/html;base64,PHNjcmlwdD4=',
      'file:///etc/passwd',
      'blob:https://x/y',
      'ftp://exemplo.com',
      'tel:+5511999999999',
      'intent://x#Intent;end',
    ]) {
      expect([url, safeHref(url)]).toEqual([url, null]);
    }
  });

  it('recusa os truques de espaço e caractere de controle que enganam filtros', () => {
    for (const url of [
      ' javascript:alert(1)',
      'java\tscript:alert(1)',
      'java\nscript:alert(1)',
      'java\rscript:alert(1)',
      '\u0000javascript:alert(1)',
      'javascript\u0000:alert(1)',
      '\u0001https://exemplo.com',
      'https://exemplo.com/a b',
      'https://exemplo.com x',
      'https://exemplo.com/​x'.replace('​', '\u0085'),
    ]) {
      expect([JSON.stringify(url), safeHref(url)]).toEqual([JSON.stringify(url), null]);
    }
  });

  it('recusa caminhos relativos, protocolo implícito, âncoras soltas e vazio', () => {
    for (const url of [
      '/semana',
      '//evil.com',
      'exemplo.com',
      '#topo',
      '?x=1',
      '',
      '   ',
      'http:/x',
      'https:',
      'mailto:',
    ]) {
      expect([url, safeHref(url)]).toEqual([url, null]);
    }
    expect(safeHref(undefined)).toBeNull();
    expect(safeHref(null)).toBeNull();
  });

  it('só http(s) abre em outra aba', () => {
    expect(isWebLink('https://x.com')).toBe(true);
    expect(isWebLink('HTTP://x.com')).toBe(true);
    expect(isWebLink('mailto:a@b.com')).toBe(false);
  });
});

describe('MarkdownView: formatação', () => {
  it('títulos descem um nível para ficar abaixo do título da página', () => {
    const { container } = renderMd(
      '# um\n## dois\n### três\n#### quatro\n##### cinco\n###### seis',
    );
    expect(container.querySelector('h1')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'um' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'dois' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: 'três' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 5, name: 'quatro' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 6 }).map((h) => h.textContent)).toEqual([
      'cinco',
      'seis',
    ]);
  });

  it('negrito, itálico, riscado, citação, listas, código e linha horizontal', () => {
    const { container } = renderMd(
      [
        '**forte** _itálico_ ~~riscado~~',
        '',
        '> citação',
        '',
        '- a',
        '- b',
        '',
        '1. um',
        '2. dois',
        '',
        '`inline`',
        '',
        '```',
        'bloco',
        '```',
        '',
        '---',
      ].join('\n'),
    );
    expect(container.querySelector('strong')).toHaveTextContent('forte');
    expect(container.querySelector('em')).toHaveTextContent('itálico');
    expect(container.querySelector('del')).toHaveTextContent('riscado');
    expect(container.querySelector('blockquote')).toHaveTextContent('citação');
    expect(container.querySelectorAll('ul li')).toHaveLength(2);
    expect(container.querySelectorAll('ol li')).toHaveLength(2);
    expect(container.querySelector('pre code')).toHaveTextContent('bloco');
    expect(container.querySelector('p code')).toHaveTextContent('inline');
    expect(container.querySelector('hr')).not.toBeNull();
  });

  it('tabelas e listas de tarefas (GFM); as caixas são só para ver', () => {
    const { container } = renderMd('| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] feito\n- [ ] a fazer');
    expect(container.querySelectorAll('table th')).toHaveLength(2);
    expect(container.querySelectorAll('table td')).toHaveLength(2);
    const boxes = container.querySelectorAll('input[type="checkbox"]');
    expect(boxes).toHaveLength(2);
    expect((boxes[0] as HTMLInputElement).checked).toBe(true);
    expect((boxes[1] as HTMLInputElement).checked).toBe(false);
    for (const box of boxes) expect(box).toBeDisabled();
  });

  it('acentos, emoji e quebras de linha aparecem como escritos', () => {
    renderMd('Ação 🚀 — “aspas”');
    expect(screen.getByText('Ação 🚀 — “aspas”')).toBeInTheDocument();
  });

  it('texto vazio não renderiza nada e não falha', () => {
    const { container } = renderMd('');
    expect(container.textContent).toBe('');
  });
});

describe('MarkdownView: links', () => {
  it('link https abre em outra aba, sem passar o contexto (noopener, noreferrer, nofollow)', () => {
    renderMd('[o site](https://exemplo.com/x)');
    const link = screen.getByRole('link', { name: 'o site' });
    expect(link).toHaveAttribute('href', 'https://exemplo.com/x');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer nofollow');
  });

  it('endereço solto vira link (GFM) com as mesmas proteções', () => {
    renderMd('veja https://exemplo.com agora');
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://exemplo.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('mailto é link, mas não abre outra aba', () => {
    renderMd('[escreva](mailto:ana@exemplo.com)');
    const link = screen.getByRole('link', { name: 'escreva' });
    expect(link).toHaveAttribute('href', 'mailto:ana@exemplo.com');
    expect(link).not.toHaveAttribute('target');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('esquemas perigosos viram só o texto, sem link', () => {
    for (const url of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:x',
      'file:///etc/passwd',
      '/semana',
      '//evil.com',
      '#topo',
    ]) {
      const { container, unmount } = renderMd(`[texto do link](${url})`);
      expect([url, container.querySelector('a')]).toEqual([url, null]);
      expect(container.textContent).toContain('texto do link');
      assertNoDangerousDom(container);
      unmount();
    }
  });

  it('o link de referência com destino perigoso também é neutralizado', () => {
    const { container } = renderMd('[clique][x]\n\n[x]: javascript:alert(1)');
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('clique');
  });
});

describe('MarkdownView: imagens (nunca carregam)', () => {
  it('mostra o texto alternativo, sem elemento de imagem e sem requisição', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { container } = renderMd('![foto da praia](https://rastreador.exemplo/pixel.png)');
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('[imagem: foto da praia]');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(container.innerHTML).not.toContain('rastreador.exemplo');
    fetchSpy.mockRestore();
  });

  it('sem texto alternativo, só avisa que havia uma imagem', () => {
    const { container } = renderMd('![](https://x.exemplo/a.png)');
    expect(container.textContent).toBe('[imagem]');
    expect(container.innerHTML).not.toContain('x.exemplo');
  });

  it('imagem com endereço perigoso também não vira nada além do texto', () => {
    const { container } = renderMd(
      '![x](javascript:alert(1)) ![y](data:image/svg+xml,<svg onload=alert(1)>)',
    );
    assertNoDangerousDom(container);
  });
});

describe('MarkdownView: HTML e XSS', () => {
  const vectors: [string, string][] = [
    ['script', '<script>alert(1)</script>'],
    ['script com maiúsculas', '<ScRiPt>alert(1)</sCrIpT>'],
    ['img onerror', '<img src=x onerror=alert(1)>'],
    ['img onerror com aspas', '<img src="x" onerror="alert(1)">'],
    ['svg onload', '<svg onload=alert(1)>'],
    ['svg com script', '<svg><script>alert(1)</script></svg>'],
    ['iframe', '<iframe src="javascript:alert(1)"></iframe>'],
    ['iframe srcdoc', '<iframe srcdoc="<script>alert(1)</script>"></iframe>'],
    ['object', '<object data="javascript:alert(1)"></object>'],
    ['embed', '<embed src="javascript:alert(1)">'],
    ['a javascript', '<a href="javascript:alert(1)">x</a>'],
    ['a com onclick', '<a href="https://ok.com" onclick="alert(1)">x</a>'],
    ['div com onmouseover', '<div onmouseover="alert(1)">x</div>'],
    ['style', '<style>body{display:none}</style>'],
    ['style inline', '<p style="position:fixed;top:0;left:0;width:100%;height:100%">x</p>'],
    ['form', '<form action="https://evil.com"><input name=senha></form>'],
    ['meta refresh', '<meta http-equiv="refresh" content="0;url=https://evil.com">'],
    ['base', '<base href="https://evil.com/">'],
    ['link', '<link rel="stylesheet" href="https://evil.com/x.css">'],
    ['body onload', '<body onload=alert(1)>'],
    ['details ontoggle', '<details open ontoggle=alert(1)>'],
    ['comentário escondendo', '<!--><script>alert(1)</script>-->'],
    ['entidades', '&lt;script&gt;alert(1)&lt;/script&gt;'],
    ['markdown dentro de HTML', '<div>**x**</div><script>alert(1)</script>'],
  ];

  it.each(vectors)('neutraliza: %s', (_name, payload) => {
    const alertSpy = vi.fn();
    vi.stubGlobal('alert', alertSpy);
    try {
      const { container } = renderMd(`antes\n\n${payload}\n\ndepois`);
      assertNoDangerousDom(container);
      expect(alertSpy).not.toHaveBeenCalled();
      expect(container.textContent).toContain('antes');
      expect(container.textContent).toContain('depois');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('o HTML digitado aparece como texto, para a pessoa ver o que escreveu', () => {
    const { container } = renderMd('use a tag <b>negrito</b> assim');
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toContain('negrito');
  });

  it('vetores dentro de links, títulos e células de tabela', () => {
    const { container } = renderMd(
      [
        '# <img src=x onerror=alert(1)>',
        '',
        '[<script>alert(1)</script>](https://ok.com)',
        '',
        '| a |',
        '|---|',
        '| <svg onload=alert(1)> |',
        '',
        '- <script>alert(1)</script>',
        '',
        '> <iframe src=javascript:alert(1)>',
      ].join('\n'),
    );
    assertNoDangerousDom(container);
  });

  it('um texto enorme com muitos vetores não derruba a renderização', () => {
    const big = Array.from(
      { length: 300 },
      (_, i) => `**${i}** <script>alert(${i})</script> [x](javascript:alert(${i}))`,
    ).join('\n\n');
    const { container } = renderMd(big);
    assertNoDangerousDom(container);
    expect(container.querySelectorAll('strong')).toHaveLength(300);
  });

  it('o mesmo texto renderizado de novo dá o mesmo resultado (sem estado escondido)', () => {
    const source = '# oi\n\n[a](https://x.com) <script>x</script>';
    const first = renderMd(source).container.innerHTML;
    const second = renderMd(source).container.innerHTML;
    expect(second).toBe(first);
  });
});
