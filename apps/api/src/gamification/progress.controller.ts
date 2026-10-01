import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse, createZodDto } from 'nestjs-zod';
import { progressSchema, todayResponseSchema } from '@lifexp/shared';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ProgressService } from './progress.service.js';
import { TodayService } from './today.service.js';

class ProgressDto extends createZodDto(progressSchema) {}
class TodayResponseDto extends createZodDto(todayResponseSchema) {}

@ApiTags('gamification')
@ApiBearerAuth()
@Controller()
export class ProgressController {
  constructor(
    private readonly progressService: ProgressService,
    private readonly todayService: TodayService,
  ) {}

  @Get('progress')
  @ApiOperation({ summary: 'XP e nível geral e por área' })
  @ZodResponse({ type: ProgressDto })
  progress(@CurrentUser() user: AuthenticatedUser) {
    return this.progressService.getProgress(user.id);
  }

  @Get('today')
  @ApiOperation({
    summary: 'Tela Hoje: blocos de hoje e de ontem ainda dentro da janela, XP do dia e nível',
  })
  @ZodResponse({ type: TodayResponseDto })
  today(@CurrentUser() user: AuthenticatedUser) {
    return this.todayService.getToday(user.id);
  }
}
