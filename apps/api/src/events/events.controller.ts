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
import { CreateEventDto, EventDto, ListEventsQueryDto, UpdateEventDto } from './events.dto.js';
import { EventsService } from './events.service.js';

@ApiTags('events')
@ApiBearerAuth()
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @ApiOperation({ summary: 'Eventos de um período (datas civis, máximo de 93 dias)' })
  @ZodResponse({ type: [EventDto] })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListEventsQueryDto) {
    return this.events.list(user.id, query.from, query.to);
  }

  @Post()
  @ApiOperation({ summary: 'Cria um evento (não gera XP)' })
  @ZodResponse({ status: HttpStatus.CREATED, type: EventDto })
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateEventDto) {
    return this.events.create(user.id, body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do evento' })
  @ZodResponse({ type: EventDto })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.get(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita o evento' })
  @ZodResponse({ type: EventDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateEventDto,
  ) {
    return this.events.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Exclui o evento (idempotente)' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.events.remove(user.id, id);
  }
}
