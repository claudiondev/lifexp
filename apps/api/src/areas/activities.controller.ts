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
  ActivityDto,
  CreateActivityDto,
  ListActivitiesQueryDto,
  UpdateActivityDto,
} from './activities.dto.js';
import { ActivitiesService } from './activities.service.js';

@ApiTags('activities')
@ApiBearerAuth()
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista as atividades, opcionalmente de uma área' })
  @ZodResponse({ type: [ActivityDto] })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListActivitiesQueryDto) {
    return this.activitiesService.list(user.id, query.areaId, query.includeArchived);
  }

  @Post()
  @ApiOperation({ summary: 'Cria uma atividade em uma área' })
  @ZodResponse({ status: HttpStatus.CREATED, type: ActivityDto })
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateActivityDto) {
    return this.activitiesService.create(user.id, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita nome ou peso de XP da atividade' })
  @ZodResponse({ type: ActivityDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateActivityDto,
  ) {
    return this.activitiesService.update(user.id, id, body);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Arquiva a atividade, preservando o histórico' })
  @ZodResponse({ type: ActivityDto })
  archive(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.activitiesService.archive(user.id, id);
  }

  @Post(':id/unarchive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restaura uma atividade arquivada' })
  @ZodResponse({ type: ActivityDto })
  unarchive(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.activitiesService.unarchive(user.id, id);
  }
}
