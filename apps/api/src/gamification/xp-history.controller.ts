import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse, createZodDto } from 'nestjs-zod';
import { xpHistoryPageSchema, xpHistoryQuerySchema } from '@lifexp/shared';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { XpHistoryService } from './xp-history.service.js';

class XpHistoryQueryDto extends createZodDto(xpHistoryQuerySchema) {}
class XpHistoryPageDto extends createZodDto(xpHistoryPageSchema) {}

@ApiTags('gamification')
@ApiBearerAuth()
@Controller('xp')
export class XpHistoryController {
  constructor(private readonly history: XpHistoryService) {}

  @Get('history')
  @ApiOperation({
    summary:
      'Histórico de XP por origem (bloco, marco, meta e estorno), do mais novo ao mais antigo',
  })
  @ZodResponse({ type: XpHistoryPageDto })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: XpHistoryQueryDto) {
    return this.history.list(user.id, query);
  }
}
