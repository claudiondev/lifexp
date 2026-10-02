import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ZodResponse, createZodDto } from 'nestjs-zod';
import { weeklyReportQuerySchema, weeklyReportSchema } from '@lifexp/shared';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { renderReportMarkdown } from './domain/weekly-report-markdown.js';
import { ReportsService } from './reports.service.js';

class WeeklyReportQueryDto extends createZodDto(weeklyReportQuerySchema) {}
class WeeklyReportDto extends createZodDto(weeklyReportSchema) {}

@ApiTags('reviews')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('weekly')
  @ApiOperation({
    summary:
      'Relatório da semana (a atual por padrão): blocos, aderência, XP, quest, conquistas e metas',
  })
  @ZodResponse({ type: WeeklyReportDto })
  weekly(@CurrentUser() user: AuthenticatedUser, @Query() query: WeeklyReportQueryDto) {
    return this.reports.weekly(user.id, query.weekStart);
  }

  // A rota termina em ".md" para o endereço já dizer o que baixa; o nome do arquivo leva a semana.
  @Get('weekly.md')
  @Header('Content-Type', 'text/markdown; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'O mesmo relatório em Markdown, para baixar' })
  async weeklyMarkdown(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WeeklyReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const report = await this.reports.weekly(user.id, query.weekStart);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="lifexp-relatorio-${report.weekStart}.md"`,
    );
    return renderReportMarkdown(report);
  }
}
