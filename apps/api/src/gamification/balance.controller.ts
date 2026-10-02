import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse, createZodDto } from 'nestjs-zod';
import { balanceSchema } from '@lifexp/shared';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { BalanceService } from './balance.service.js';

class BalanceDto extends createZodDto(balanceSchema) {}

@ApiTags('gamification')
@ApiBearerAuth()
@Controller('balance')
export class BalanceController {
  constructor(private readonly balance: BalanceService) {}

  @Get()
  @ApiOperation({
    summary: 'Radar de equilíbrio: aderência por área nas últimas 4 semanas (blocos, não XP)',
  })
  @ZodResponse({ type: BalanceDto })
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.balance.get(user.id);
  }
}
