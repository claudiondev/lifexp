import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse, createZodDto } from 'nestjs-zod';
import { consistencyQuerySchema, consistencySchema } from '@lifexp/shared';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ConsistencyService } from './consistency.service.js';

class ConsistencyQueryDto extends createZodDto(consistencyQuerySchema) {}
class ConsistencyDto extends createZodDto(consistencySchema) {}

@ApiTags('gamification')
@ApiBearerAuth()
@Controller('consistency')
export class ConsistencyController {
  constructor(private readonly consistency: ConsistencyService) {}

  @Get()
  @ApiOperation({
    summary:
      'Mapa de constância: blocos planejados e concluídos por dia nas últimas N semanas (padrão 26)',
  })
  @ZodResponse({ type: ConsistencyDto })
  get(@CurrentUser() user: AuthenticatedUser, @Query() query: ConsistencyQueryDto) {
    return this.consistency.get(user.id, query);
  }
}
