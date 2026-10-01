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
import { AreaDto, CreateAreaDto, ListAreasQueryDto, UpdateAreaDto } from './areas.dto.js';
import { AreasService } from './areas.service.js';

@ApiTags('areas')
@ApiBearerAuth()
@Controller('areas')
export class AreasController {
  constructor(private readonly areasService: AreasService) {}

  @Get()
  @ApiOperation({ summary: 'Lista as áreas da pessoa autenticada' })
  @ZodResponse({ type: [AreaDto] })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListAreasQueryDto) {
    return this.areasService.list(user.id, query.includeArchived);
  }

  @Post()
  @ApiOperation({ summary: 'Cria uma área' })
  @ZodResponse({ status: HttpStatus.CREATED, type: AreaDto })
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateAreaDto) {
    return this.areasService.create(user.id, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita nome, cor ou ícone da área' })
  @ZodResponse({ type: AreaDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAreaDto,
  ) {
    return this.areasService.update(user.id, id, body);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Arquiva a área, preservando o histórico' })
  @ZodResponse({ type: AreaDto })
  archive(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.areasService.archive(user.id, id);
  }

  @Post(':id/unarchive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restaura uma área arquivada' })
  @ZodResponse({ type: AreaDto })
  unarchive(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.areasService.unarchive(user.id, id);
  }
}
