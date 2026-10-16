import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse, createZodDto } from 'nestjs-zod';
import { xpEvolutionQuerySchema, xpEvolutionSchema } from '@lifexp/shared';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { XpEvolutionService } from './xp-evolution.service.js';

class XpEvolutionQueryDto extends createZodDto(xpEvolutionQuerySchema) {}
class XpEvolutionDto extends createZodDto(xpEvolutionSchema) {}

@ApiTags('gamification')
@ApiBearerAuth()
@Controller('xp')
export class XpEvolutionController {
  constructor(private readonly evolution: XpEvolutionService) {}

  @Get('evolution')
  @ApiOperation({
    summary: 'Evolução do XP: líquido por semana e por área nas últimas N semanas (padrão 8)',
  })
  @ZodResponse({ type: XpEvolutionDto })
  get(@CurrentUser() user: AuthenticatedUser, @Query() query: XpEvolutionQueryDto) {
    return this.evolution.get(user.id, query);
  }
}
