import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse, createZodDto } from 'nestjs-zod';
import { createRewardSchema, rewardSchema, updateRewardSchema } from '@lifexp/shared';
import { z } from 'zod';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { RewardsService } from './rewards.service.js';

class RewardDto extends createZodDto(rewardSchema) {}
class RewardListDto extends createZodDto(z.array(rewardSchema)) {}
class CreateRewardDto extends createZodDto(createRewardSchema) {}
class UpdateRewardDto extends createZodDto(updateRewardSchema) {}

@ApiTags('gamification')
@ApiBearerAuth()
@Controller('rewards')
export class RewardsController {
  constructor(private readonly rewards: RewardsService) {}

  @Get()
  @ApiOperation({ summary: 'As recompensas reais da pessoa (as mais novas primeiro)' })
  @ZodResponse({ type: RewardListDto })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.rewards.list(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Cadastra uma recompensa real com o seu gatilho (até 50)' })
  @ZodResponse({ status: HttpStatus.CREATED, type: RewardDto })
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateRewardDto) {
    return this.rewards.create(user.id, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita o nome e a descrição (o gatilho não muda)' })
  @ZodResponse({ type: RewardDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateRewardDto,
  ) {
    return this.rewards.update(user.id, id, body);
  }

  @Post(':id/redeem')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resgata uma recompensa já desbloqueada (idempotente)' })
  @ZodResponse({ type: RewardDto })
  redeem(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rewards.redeem(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Exclui a recompensa' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.rewards.remove(user.id, id);
  }
}
