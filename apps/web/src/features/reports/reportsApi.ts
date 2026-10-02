import { weeklyReportSchema, type CivilDate, type WeeklyReport } from '@lifexp/shared';
import { apiFetch, apiJson } from '../../lib/apiClient';

export const getWeeklyReport = (weekStart: CivilDate): Promise<WeeklyReport> =>
  apiJson(`/reports/weekly?weekStart=${weekStart}`, weeklyReportSchema);

/** Baixa o relatório da semana em Markdown (RF47): busca com a sessão e entrega como arquivo. */
export async function downloadWeeklyReport(weekStart: CivilDate): Promise<void> {
  const response = await apiFetch(`/reports/weekly.md?weekStart=${weekStart}`);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = `lifexp-relatorio-${weekStart}.md`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
