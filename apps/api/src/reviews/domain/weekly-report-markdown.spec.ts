import type { WeeklyReport } from '@lifexp/shared';
import { describe, expect, it } from 'vitest';
import { escapeMarkdown, renderReportMarkdown } from './weekly-report-markdown.js';

const AREA = '0192f1a0-7b3c-7000-8000-0000000000a1';
const report = (over: Partial<WeeklyReport> = {}): WeeklyReport => ({
  weekStart: '2026-10-05',
  weekEnd: '2026-10-11',
  blocks: { planned: 10, completed: 8, skipped: 1, open: 2, adherence: 80 },
  minutes: 495,
  xp: {
    gained: 700,
    reverted: 60,
    net: 640,
    byArea: [{ areaId: AREA, name: 'Saúde', amount: 640 }],
  },
  areas: [
    {
      areaId: AREA,
      name: 'Saúde',
      color: 'moss',
      icon: 'heart-pulse',
      planned: 4,
      completed: 3,
      score: 75,
      minutes: 180,
    },
    {
      areaId: '0192f1a0-7b3c-7000-8000-0000000000a2',
      name: 'Estudo',
      color: 'sky',
      icon: 'book-open',
      planned: 0,
      completed: 0,
      score: null,
      minutes: 0,
    },
  ],
  quest: {
    weekStart: '2026-10-05',
    status: 'completed',
    eligible: 5,
    completed: 4,
    target: 4,
    ratio: 0.8,
    bonusXp: 120,
    tiers: [],
    completedAt: '2026-10-09T12:00:00.000Z',
  },
  achievements: [],
  goals: { milestones: [], completed: [] },
  streak: {
    current: 5,
    best: 9,
    lastFulfilledDate: '2026-10-08',
    joker: { weekStart: '2026-10-05', used: false, usedOn: null },
  },
  bestDay: { date: '2026-10-06', completed: 3 },
  ...over,
});

describe('escapeMarkdown', () => {
  it('escapa o que o Markdown interpretaria e troca quebras de linha por espaço', () => {
    expect(escapeMarkdown('a|b *c* _d_ [e](f) <g> `h` # i')).toBe(
      'a\\|b \\*c\\* \\_d\\_ \\[e\\]\\(f\\) \\<g\\> \\`h\\` \\# i',
    );
    expect(escapeMarkdown('linha 1\nlinha 2\r\nlinha 3')).toBe('linha 1 linha 2 linha 3');
  });

  it('deixa o texto comum como está', () => {
    expect(escapeMarkdown('Corrida da manhã, às 6h')).toBe('Corrida da manhã, às 6h');
  });
});

describe('renderReportMarkdown', () => {
  it('título com o período, resumo e tabela por área (sem dados em vez de 0%)', () => {
    const md = renderReportMarkdown(report());
    expect(md).toContain('# Relatório da semana de 05/10 a 11/10/2026');
    expect(md).toContain('- **Blocos:** 8 de 10 cumpridos (80% de aderência).');
    expect(md).toContain('- **Ainda em aberto:** 2 blocos, com tempo para cumprir.');
    expect(md).toContain('- **Pulados:** 1 (sem XP e sem penalidade).');
    expect(md).toContain('- **Tempo cumprido:** 8 h 15 min.');
    expect(md).toContain('- **XP da semana:** +640 (700 ganhos, 60 devolvidos por desfazer).');
    expect(md).toContain('- **Melhor dia:** 06/10, com 3 blocos cumpridos.');
    expect(md).toContain('| Saúde | 3 de 4 | 75% | 3 h |');
    expect(md).toContain('| Estudo | 0 de 0 | sem dados | 0 min |');
  });

  it('quest cumprida, em andamento e sem quest', () => {
    expect(renderReportMarkdown(report())).toContain(
      'Cumprida! 4 de 5 blocos, com bônus de 120 XP.',
    );
    const active = report({
      quest: { ...report().quest, status: 'active', completed: 2, completedAt: null },
    });
    expect(renderReportMarkdown(active)).toContain(
      'Em andamento: 2 de 5 blocos (a meta são 4), bônus de 120 XP.',
    );
    const none = report({ quest: { ...report().quest, status: 'none', eligible: 0 } });
    expect(renderReportMarkdown(none)).toContain('Esta semana não teve quest.');
  });

  it('streak com o coringa disponível ou usado', () => {
    expect(renderReportMarkdown(report())).toContain('- **Streak:** 5 dias (recorde 9).');
    expect(renderReportMarkdown(report())).toContain('- **Coringa da semana:** disponível.');
    const used = report({
      streak: {
        current: 1,
        best: 1,
        lastFulfilledDate: '2026-10-05',
        joker: { weekStart: '2026-10-05', used: true, usedOn: '2026-10-06' },
      },
    });
    const md = renderReportMarkdown(used);
    expect(md).toContain('- **Streak:** 1 dia (recorde 1).');
    expect(md).toContain('- **Coringa da semana:** usado em 06/10, a sequência foi protegida.');
  });

  it('conquistas e metas aparecem só quando há, com os textos escapados', () => {
    const plain = renderReportMarkdown(report());
    expect(plain).not.toContain('## Conquistas');
    expect(plain).not.toContain('## Metas');

    const md = renderReportMarkdown(
      report({
        achievements: [
          { key: 'constant', title: 'Constante', unlockedAt: '2026-10-08T12:00:00.000Z' },
        ],
        goals: {
          milestones: [
            {
              goalId: AREA,
              goalTitle: 'Livro [rascunho]',
              title: 'Capítulo *1*',
              doneAt: '2026-10-08T12:00:00.000Z',
            },
          ],
          completed: [{ id: AREA, title: 'Correr 5 km', completedAt: '2026-10-08T12:00:00.000Z' }],
        },
      }),
    );
    expect(md).toContain('## Conquistas desbloqueadas\n\n- Constante');
    expect(md).toContain('- Meta concluída: Correr 5 km');
    expect(md).toContain('- Marco concluído: Capítulo \\*1\\* (Livro \\[rascunho\\])');
  });

  it('nome de área com Markdown não quebra a tabela', () => {
    const base = report();
    const md = renderReportMarkdown(
      report({ areas: [{ ...base.areas[0]!, name: 'A | B\nC' }], xp: { ...base.xp, byArea: [] } }),
    );
    expect(md).toContain('| A \\| B C | 3 de 4 | 75% | 3 h |');
  });

  it('semana sem nada: texto simples, sem divisão por zero nem cobrança', () => {
    const empty = report({
      blocks: { planned: 0, completed: 0, skipped: 0, open: 0, adherence: null },
      minutes: 0,
      xp: { gained: 0, reverted: 0, net: 0, byArea: [] },
      areas: [],
      bestDay: null,
      quest: { ...report().quest, status: 'none', eligible: 0 },
    });
    const md = renderReportMarkdown(empty);
    expect(md).toContain('Nenhum bloco chegou ao fim do prazo nesta semana.');
    expect(md).toContain('- **XP da semana:** 0.');
    expect(md).toContain('Nenhuma área ativa.');
    expect(md).not.toContain('Melhor dia');
    expect(md).not.toContain('## XP por área');
    expect(md).not.toContain('NaN');
  });

  it('só blocos em aberto: não inventa porcentagem', () => {
    const md = renderReportMarkdown(
      report({ blocks: { planned: 0, completed: 0, skipped: 0, open: 2, adherence: null } }),
    );
    expect(md).toContain('- **Blocos:** 0 de 0 cumpridos (sem blocos contados).');
    expect(md).not.toContain('0% de aderência');
  });

  it('termina com a nota de que aderência conta blocos', () => {
    expect(renderReportMarkdown(report()).trimEnd()).toMatch(
      /_Gerado pelo LifeXP\. Aderência conta blocos, não minutos nem XP\._$/,
    );
  });

  it('horas redondas e só minutos', () => {
    expect(renderReportMarkdown(report({ minutes: 120 }))).toContain('- **Tempo cumprido:** 2 h.');
    expect(renderReportMarkdown(report({ minutes: 45 }))).toContain(
      '- **Tempo cumprido:** 45 min.',
    );
  });
});
