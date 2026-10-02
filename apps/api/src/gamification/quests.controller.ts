import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse, createZodDto } from 'nestjs-zod';
import { questQuerySchema, questSchema } from '@lifexp/shared';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { QuestService } from './quest.service.js';

class QuestQueryDto extends createZodDto(questQuerySchema) {}
class QuestDto extends createZodDto(questSchema) {}

@ApiTags('gamification')
@ApiBearerAuth()
@Controller('quest')
export class QuestsController {
  constructor(private readonly quests: QuestService) {}

  @Get()
  @ApiOperation({
    summary:
      'A quest semanal: blocos cumpridos × alvo de 80%, faixas e bônus (semana atual por padrão)',
  })
  @ZodResponse({ type: QuestDto })
  get(@CurrentUser() user: AuthenticatedUser, @Query() query: QuestQueryDto) {
    return this.quests.view(user.id, query.weekStart);
  }
}
