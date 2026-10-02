import type { ElementType, ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { isWebLink, safeHref } from './safeUrl';

/**
 * Renderização segura do markdown das notas (RS10). Três camadas, porque o texto é de quem digita:
 *  1. o `react-markdown` não interpreta HTML cru (ele aparece como texto) e só gera elementos React;
 *  2. o `rehype-sanitize` remove atributos e elementos perigosos que ainda assim chegassem à árvore;
 *  3. links e imagens passam por nossas regras: só `http(s)` e `mailto` viram link (com `noopener
 *     noreferrer nofollow`) e imagens NUNCA são carregadas (uma imagem remota entrega o IP e permite rastrear).
 */

/** Os títulos da nota ficam abaixo do título da página: `#` vira `h2`, `##` vira `h3`... */
const heading = (Tag: ElementType, className: string) =>
  function Heading({ children }: { children?: ReactNode }) {
    return <Tag className={cn('font-display font-bold', className)}>{children}</Tag>;
  };

const components: Components = {
  h1: heading('h2', 'mt-6 mb-2 text-2xl'),
  h2: heading('h3', 'mt-5 mb-2 text-xl'),
  h3: heading('h4', 'mt-4 mb-1.5 text-lg'),
  h4: heading('h5', 'mt-3 mb-1 text-base'),
  h5: heading('h6', 'mt-3 mb-1 text-sm'),
  h6: heading('h6', 'mt-3 mb-1 text-sm'),
  a({ href, children }) {
    const safe = safeHref(href);
    // Destino não permitido: o texto fica, sem ser link.
    if (!safe) return <span>{children}</span>;
    return (
      <a
        href={safe}
        {...(isWebLink(safe) && { target: '_blank' })}
        rel="noopener noreferrer nofollow"
        className="text-primary underline underline-offset-2 hover:brightness-125"
      >
        {children}
      </a>
    );
  },
  // Nunca carrega a imagem: mostra o texto alternativo.
  img({ alt }) {
    return <span className="text-muted-foreground italic">[imagem{alt ? `: ${alt}` : ''}]</span>;
  },
  p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
  ul: ({ children, className }) => (
    <ul
      className={cn(
        'my-2 list-disc space-y-1 pl-6',
        className?.includes('contains-task-list') && 'list-none pl-1',
      )}
    >
      {children}
    </ul>
  ),
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-6">{children}</ol>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-4 border-border pl-4 text-muted-foreground">
      {children}
    </blockquote>
  ),
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-lg border border-border bg-background/60 p-3 font-mono text-sm">
      {children}
    </pre>
  ),
  code: ({ children, className }) => (
    <code className={cn('rounded bg-muted/60 px-1 py-0.5 font-mono text-[0.9em]', className)}>
      {children}
    </code>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border bg-muted/40 px-3 py-1.5 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border border-border px-3 py-1.5">{children}</td>,
  hr: () => <hr className="my-4 border-border" />,
  // Caixas das listas de tarefas: só para ver (a nota é editada no texto).
  input: ({ checked }) => (
    <input
      type="checkbox"
      checked={Boolean(checked)}
      disabled
      readOnly
      className="mr-2 align-middle"
    />
  ),
};

export function MarkdownView({ source, className }: { source: string; className?: string }) {
  return (
    <div className={cn('break-words', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={components}
        // A mesma lista de permitidos da nossa regra: nada além de http(s) e mailto chega ao componente.
        urlTransform={(url) => safeHref(url) ?? ''}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
