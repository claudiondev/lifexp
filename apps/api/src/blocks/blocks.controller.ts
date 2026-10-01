import { Body, Controller, Get, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse, ZodValidationPipe } from 'nestjs-zod';
import { createBlockSchema, type CreateBlockInput } from '@lifexp/shared';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { BlockDto, CreateBlockDto, WeekQueryDto, WeekResponseDto } from './blocks.dto.js';
import { BlocksService } from './blocks.service.js';

@ApiTags('blocks')
@ApiBearerAuth()
@Controller('blocks')
export class BlocksController {
  constructor(private readonly blocksService: BlocksService) {}

  @Get('week')
  @ApiOperation({ summary: 'Ocorrências da semana (que começa na segunda-feira), já calculadas' })
  @ZodResponse({ type: WeekResponseDto })
  week(@CurrentUser() user: AuthenticatedUser, @Query() query: WeekQueryDto) {
    return this.blocksService.getWeek(user.id, query.weekStart);
  }

  @Post()
  @ApiOperation({ summary: 'Cria um bloco semanal ou avulso' })
  @ApiBody({ type: CreateBlockDto })
  @ZodResponse({ status: HttpStatus.CREATED, type: BlockDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createBlockSchema)) body: CreateBlockInput,
  ) {
    return this.blocksService.create(user.id, body);
  }
}
