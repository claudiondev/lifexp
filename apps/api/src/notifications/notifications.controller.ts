import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { NotificationPreferencesService } from './notification-preferences.service.js';
import {
  ListNotificationsQueryDto,
  NotificationDto,
  NotificationPageDto,
  NotificationPreferencesResponseDto,
  ReadAllResultDto,
  UnreadCountDto,
  UpdateNotificationPreferencesDto,
} from './notifications.dto.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller()
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly preferences: NotificationPreferencesService,
  ) {}

  @Get('notifications')
  @ApiOperation({ summary: 'Central de avisos, do mais novo ao mais antigo (paginada)' })
  @ZodResponse({ type: NotificationPageDto })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListNotificationsQueryDto) {
    return this.notifications.list(user.id, query);
  }

  @Get('notifications/unread-count')
  @ApiOperation({ summary: 'Quantos avisos ainda não foram lidos' })
  @ZodResponse({ type: UnreadCountDto })
  async unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return { count: await this.notifications.unreadCount(user.id) };
  }

  @Post('notifications/read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marca todos os avisos como lidos (idempotente)' })
  @ZodResponse({ type: ReadAllResultDto })
  async readAll(@CurrentUser() user: AuthenticatedUser) {
    return { updated: await this.notifications.markAllRead(user.id) };
  }

  @Post('notifications/:id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marca um aviso como lido (idempotente)' })
  @ZodResponse({ type: NotificationDto })
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(user.id, id);
  }

  @Get('notification-preferences')
  @ApiOperation({ summary: 'Preferências de notificação (com os padrões se nunca alteradas)' })
  @ZodResponse({ type: NotificationPreferencesResponseDto })
  getPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.preferences.get(user.id);
  }

  @Put('notification-preferences')
  @ApiOperation({ summary: 'Altera as preferências (só os campos enviados)' })
  @ZodResponse({ type: NotificationPreferencesResponseDto })
  updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpdateNotificationPreferencesDto,
  ) {
    return this.preferences.update(user.id, body);
  }
}
