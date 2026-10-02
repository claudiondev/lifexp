import type { CivilDate, WeeklyReport } from '@lifexp/shared';

/** Escapa o que o Markdown interpretaria nos textos da pessoa (nomes de área, metas, marcos). */
export function escapeMarkdown(text: string): string {
  return text
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\\`*_{}[\]<>()#+!|~-]/g, (char) => `\\${char}`)
    .trim();
}

const dayMonth = (date: CivilDate) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const dayMonthYear = (date: CivilDate) => `${dayMonth(date)}/${date.slice(0, 4)}`;
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function hoursText(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

const sign = (amount: number) => (amount > 0 ? `+${amount}` : String(amount));

/**
 * O relatório semanal em Markdown (RF47), para baixar. Tom sempre positivo e factual: mostra o que foi cumprido e o
 * que ficou "sem dados", nunca cobra. Texto livre da pessoa é escapado; as datas saem como dd/MM.
 */
export function renderReportMarkdown(report: WeeklyReport): string {
  const lines: string[] = [];
  const { blocks, xp, quest, streak } = report;

  lines.push(
    `# Relatório da semana de ${dayMonth(report.weekStart)} a ${dayMonthYear(report.weekEnd)}`,
    '',
  );

  lines.push('## Resumo', '');
  if (blocks.planned === 0 && blocks.open === 0) {
    lines.push('Nenhum bloco chegou ao fim do prazo nesta semana.');
  } else {
    const adherenceText =
      blocks.adherence === null ? 'sem blocos contados' : `${blocks.adherence}% de aderência`;
    lines.push(
      `- **Blocos:** ${blocks.completed} de ${blocks.planned} cumpridos (${adherenceText}).`,
    );
  }
  if (blocks.open > 0) {
    lines.push(
      `- **Ainda em aberto:** ${plural(blocks.open, 'bloco', 'blocos')}, com tempo para cumprir.`,
    );
  }
  if (blocks.skipped > 0) {
    lines.push(`- **Pulados:** ${blocks.skipped} (sem XP e sem penalidade).`);
  }
  lines.push(`- **Tempo cumprido:** ${hoursText(report.minutes)}.`);
  lines.push(
    `- **XP da semana:** ${sign(xp.net)}` +
      (xp.reverted > 0 ? ` (${xp.gained} ganhos, ${xp.reverted} devolvidos por desfazer)` : '') +
      '.',
  );
  if (report.bestDay) {
    lines.push(
      `- **Melhor dia:** ${dayMonth(report.bestDay.date)}, com ${plural(report.bestDay.completed, 'bloco cumprido', 'blocos cumpridos')}.`,
    );
  }
  lines.push('');

  lines.push('## Por área', '');
  if (report.areas.length === 0) {
    lines.push('Nenhuma área ativa.', '');
  } else {
    lines.push('| Área | Cumpridos | Aderência | Tempo |', '| --- | --- | --- | --- |');
    for (const area of report.areas) {
      lines.push(
        `| ${escapeMarkdown(area.name)} | ${area.completed} de ${area.planned} | ${
          area.score === null ? 'sem dados' : `${area.score}%`
        } | ${hoursText(area.minutes)} |`,
      );
    }
    lines.push('');
  }

  if (xp.byArea.length > 0) {
    lines.push('## XP por área', '');
    for (const entry of xp.byArea)
      lines.push(`- ${escapeMarkdown(entry.name)}: ${sign(entry.amount)}`);
    lines.push('');
  }

  lines.push('## Quest da semana', '');
  if (quest.status === 'none') {
    lines.push('Esta semana não teve quest.');
  } else if (quest.status === 'completed') {
    lines.push(
      `Cumprida! ${quest.completed} de ${quest.eligible} blocos, com bônus de ${quest.bonusXp} XP.`,
    );
  } else {
    lines.push(
      `Em andamento: ${quest.completed} de ${quest.eligible} blocos (a meta são ${quest.target}), bônus de ${quest.bonusXp} XP.`,
    );
  }
  lines.push('');

  lines.push('## Sequência', '');
  lines.push(`- **Streak:** ${plural(streak.current, 'dia', 'dias')} (recorde ${streak.best}).`);
  lines.push(
    streak.joker.usedOn
      ? `- **Coringa da semana:** usado em ${dayMonth(streak.joker.usedOn)}, a sequência foi protegida.`
      : '- **Coringa da semana:** disponível.',
  );
  lines.push('');

  if (report.achievements.length > 0) {
    lines.push('## Conquistas desbloqueadas', '');
    for (const achievement of report.achievements) {
      lines.push(`- ${escapeMarkdown(achievement.title)}`);
    }
    lines.push('');
  }

  if (report.goals.completed.length > 0 || report.goals.milestones.length > 0) {
    lines.push('## Metas', '');
    for (const goal of report.goals.completed) {
      lines.push(`- Meta concluída: ${escapeMarkdown(goal.title)}`);
    }
    for (const milestone of report.goals.milestones) {
      lines.push(
        `- Marco concluído: ${escapeMarkdown(milestone.title)} (${escapeMarkdown(milestone.goalTitle)})`,
      );
    }
    lines.push('');
  }

  lines.push('---', '', '_Gerado pelo LifeXP. Aderência conta blocos, não minutos nem XP._', '');
  return lines.join('\n');
}
