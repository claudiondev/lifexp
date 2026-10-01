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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import {
  CreateGoalDto,
  CreateMilestoneDto,
  GoalDto,
  ListGoalsQueryDto,
  UpdateGoalDto,
  UpdateMilestoneDto,
} from './goals.dto.js';
import { GoalsService } from './goals.service.js';

@ApiTags('goals')
@ApiBearerAuth()
@Controller('goals')
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista as metas (opcionalmente por status)' })
  @ZodResponse({ type: [GoalDto] })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListGoalsQueryDto) {
    return this.goals.list(user.id, query.status);
  }

  @Post()
  @ApiOperation({ summary: 'Cria uma meta' })
  @ZodResponse({ status: HttpStatus.CREATED, type: GoalDto })
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateGoalDto) {
    return this.goals.create(user.id, body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe da meta: marcos, progresso e horas investidas' })
  @ZodResponse({ type: GoalDto })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.goals.get(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita título, descrição, área, prazo e métrica' })
  @ZodResponse({ type: GoalDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateGoalDto,
  ) {
    return this.goals.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Exclui a meta e seus marcos (idempotente)' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.goals.remove(user.id, id);
  }

  @Post(':id/milestones')
  @ApiOperation({ summary: 'Adiciona um marco ao fim da meta' })
  @ZodResponse({ status: HttpStatus.CREATED, type: GoalDto })
  addMilestone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateMilestoneDto,
  ) {
    return this.goals.addMilestone(user.id, id, body.title);
  }

  @Patch(':id/milestones/:milestoneId')
  @ApiOperation({ summary: 'Renomeia um marco' })
  @ZodResponse({ type: GoalDto })
  renameMilestone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('milestoneId', ParseUUIDPipe) milestoneId: string,
    @Body() body: UpdateMilestoneDto,
  ) {
    return this.goals.renameMilestone(user.id, id, milestoneId, body.title);
  }

  @Delete(':id/milestones/:milestoneId')
  @ApiOperation({ summary: 'Remove um marco; devolve a meta atualizada' })
  @ZodResponse({ type: GoalDto })
  removeMilestone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('milestoneId', ParseUUIDPipe) milestoneId: string,
  ) {
    return this.goals.removeMilestone(user.id, id, milestoneId);
  }
}
