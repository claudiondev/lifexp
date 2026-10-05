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
  CreateTaskDto,
  CreateTaskItemDto,
  ListTasksQueryDto,
  TaskCompletionResultDto,
  TaskDto,
  TaskListDto,
  TaskUndoResultDto,
  UpdateTaskDto,
  UpdateTaskItemDto,
} from './tasks.dto.js';
import { TasksService } from './tasks.service.js';

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @ApiOperation({ summary: 'Lista as tarefas de Hoje (scope=today) ou os Pendentes (scope=inbox)' })
  @ZodResponse({ type: TaskListDto })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListTasksQueryDto) {
    return this.tasks.list(user.id, query.scope);
  }

  @Post()
  @ApiOperation({ summary: 'Cria uma tarefa (sem dia = Pendentes)' })
  @ZodResponse({ status: HttpStatus.CREATED, type: TaskDto })
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateTaskDto) {
    return this.tasks.create(user.id, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita a tarefa (nulo limpa anotação, dia, área ou meta)' })
  @ZodResponse({ type: TaskDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateTaskDto,
  ) {
    return this.tasks.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Arquiva a tarefa (nunca exclui; idempotente)' })
  archive(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.archive(user.id, id);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Conclui a tarefa e credita o XP (idempotente)' })
  @ZodResponse({ type: TaskCompletionResultDto })
  complete(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.complete(user.id, id);
  }

  @Delete(':id/complete')
  @ApiOperation({ summary: 'Desfaz a conclusão e estorna o XP (idempotente)' })
  @ZodResponse({ type: TaskUndoResultDto })
  undo(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.undo(user.id, id);
  }

  @Post(':id/items')
  @ApiOperation({ summary: 'Acrescenta um passo ao checklist (até 20)' })
  @ZodResponse({ status: HttpStatus.CREATED, type: TaskDto })
  addItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateTaskItemDto,
  ) {
    return this.tasks.addItem(user.id, id, body);
  }

  @Patch(':id/items/:itemId')
  @ApiOperation({ summary: 'Renomeia ou marca/desmarca um passo' })
  @ZodResponse({ type: TaskDto })
  updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: UpdateTaskItemDto,
  ) {
    return this.tasks.updateItem(user.id, id, itemId, body);
  }

  @Delete(':id/items/:itemId')
  @ApiOperation({ summary: 'Remove um passo do checklist' })
  @ZodResponse({ type: TaskDto })
  removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.tasks.removeItem(user.id, id, itemId);
  }
}
