import type { Consistency } from '@lifexp/shared';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import {
  buildGrid,
  cellTitle,
  summarize,
  summaryText,
  type Cell,
  type Level,
} from './heatmapModel';

/** As classes ficam por extenso porque o Tailwind só gera o que enxerga no código. */
const LEVEL_CLASS: Record<Level, string> = {
  rest: 'bg-muted/40',
  none: 'border border-xp/30',
  low: 'bg-xp/25',
  mid: 'bg-xp/50',
  high: 'bg-xp/75',
  full: 'bg-xp',
};

const LEGEND: { level: Level; label: string }[] = [
  { level: 'none', label: 'Plano sem conclusão' },
  { level: 'low', label: 'Poucos blocos' },
  { level: 'mid', label: 'Metade' },
  { level: 'high', label: 'Quase tudo' },
  { level: 'full', label: 'Tudo concluído' },
];

const WEEKDAY_LABELS = ['Seg', '', 'Qua', '', 'Sex', '', ''];

const cellClass = (cell: Cell) =>
  cn(
    'size-3 rounded-[3px] sm:size-3.5',
    cell.kind === 'future' ? 'bg-transparent' : LEVEL_CLASS[cell.level],
  );

/**
 * Mapa de constância estilo "calendário de contribuições": uma coluna por semana, uma linha por dia da semana. Mostra
 * o que foi FEITO: dia sem plano é um quadrado discreto e dia com plano e nada concluído é só um aro vazio, nunca
 * vermelho. Os quadrados são enfeite (a tela inteira tem um resumo em texto): leitor de tela lê o resumo uma vez.
 */
export function ConsistencyHeatmap({ consistency }: { consistency: Consistency }) {
  const columns = buildGrid(consistency);
  const summary = summarize(consistency.days);
  const scroller = useRef<HTMLDivElement>(null);

  // Em tela estreita o mapa rola; abre já mostrando as semanas mais recentes.
  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollLeft = node.scrollWidth;
  }, [columns.length]);

  return (
    <figure className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6">
      <figcaption className="text-sm text-muted-foreground">{summaryText(summary)}</figcaption>

      <div ref={scroller} className="mt-4 overflow-x-auto pb-2">
        <div role="img" aria-label={summaryText(summary)} className="flex w-max gap-2">
          <div
            aria-hidden
            className="flex flex-col gap-[3px] pt-5 pr-1 text-[0.65rem] text-muted-foreground"
          >
            {WEEKDAY_LABELS.map((label, index) => (
              <span key={index} className="h-3 leading-3 sm:h-3.5 sm:leading-[0.875rem]">
                {label}
              </span>
            ))}
          </div>
          <div aria-hidden className="flex gap-[3px]">
            {columns.map((column) => (
              <div key={column.weekStart} className="flex flex-col gap-[3px]">
                <span className="h-4 text-[0.65rem] leading-4 text-muted-foreground">
                  {column.monthLabel ?? ''}
                </span>
                {column.cells.map((cell) => (
                  <div
                    key={cell.date}
                    data-testid={cell.kind === 'day' ? 'heat-cell' : undefined}
                    data-level={cell.kind === 'day' ? cell.level : undefined}
                    title={cellTitle(cell)}
                    className={cellClass(cell)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <ul
        aria-label="Legenda"
        className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.7rem] text-muted-foreground"
      >
        {LEGEND.map(({ level, label }) => (
          <li key={level} className="flex items-center gap-1.5">
            <span aria-hidden className={cn('size-3 rounded-[3px]', LEVEL_CLASS[level])} />
            {label}
          </li>
        ))}
      </ul>
    </figure>
  );
}
