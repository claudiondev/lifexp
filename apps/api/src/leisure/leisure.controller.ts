import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import {
  CreateLeisureOptionDto,
  LeisureOptionDto,
  LeisureOptionListDto,
  LeisureSessionDto,
  LeisureSummaryDto,
  ListLeisureOptionsQueryDto,
  StartLeisureSessionDto,
  UpdateLeisureOptionDto,
} from './leisure.dto.js';
import { LeisureOptionsService } from './leisure-options.service.js';
import { LeisureService } from './leisure.service.js';

@ApiTags('leisure')
@ApiBearerAuth()
@Controller('leisure')
export class LeisureController {
  constructor(
    private readonly leisure: LeisureService,
    private readonly options: LeisureOptionsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Saldo de tempo de lazer da semana atual, ganho por atividade e sessões',
  })
  @ZodResponse({ type: LeisureSummaryDto })
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.leisure.getSummary(user.id);
  }

  @Get('options')
  @ApiOperation({
    summary: 'Lista os lazeres cadastrados (includeArchived=true traz os arquivados)',
  })
  @ZodResponse({ type: LeisureOptionListDto })
  listOptions(@CurrentUser() user: AuthenticatedUser, @Query() query: ListLeisureOptionsQueryDto) {
    return this.options.list(user.id, query.includeArchived);
  }

  @Post('options')
  @ApiOperation({ summary: 'Cadastra um lazer (até 20 ativos, nome único)' })
  @ZodResponse({ status: HttpStatus.CREATED, type: LeisureOptionDto })
  createOption(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateLeisureOptionDto) {
    return this.options.create(user.id, body);
  }

  @Patch('options/:id')
  @ApiOperation({ summary: 'Renomeia, troca o ícone, arquiva ou restaura um lazer' })
  @ZodResponse({ type: LeisureOptionDto })
  updateOption(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateLeisureOptionDto,
  ) {
    return this.options.update(user.id, id, body);
  }

  @Post('sessions')
  @ApiOperation({ summary: 'Inicia o cronômetro de um lazer (limite = saldo de agora)' })
  @ZodResponse({ status: HttpStatus.CREATED, type: LeisureSessionDto })
  start(@CurrentUser() user: AuthenticatedUser, @Body() body: StartLeisureSessionDto) {
    return this.leisure.start(user.id, body.optionId);
  }

  @Post('sessions/:id/stop')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Para o cronômetro (idempotente)' })
  @ZodResponse({ type: LeisureSessionDto })
  stop(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.leisure.stop(user.id, id);
  }
}
