import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ZodResponse, createZodDto } from 'nestjs-zod';
import { revokeOthersResultSchema, sessionListSchema } from '@lifexp/shared';
import { CLOCK, type Clock } from '../clock/clock.js';
import type { Env } from '../config/env.schema.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import { CurrentUser } from './current-user.decorator.js';
import { REFRESH_COOKIE_NAME, refreshCookieOptions } from './refresh-cookie.js';
import { SessionsService } from './sessions.service.js';

class SessionListDto extends createZodDto(sessionListSchema) {}
class RevokeOthersResultDto extends createZodDto(revokeOthersResultSchema) {}

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth/sessions')
export class SessionsController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly config: ConfigService<Env, true>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lista os dispositivos com sessão ativa (a atual primeiro)' })
  @ZodResponse({ type: SessionListDto })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.sessions.list(user.id, user.sessionId, this.clock.now());
  }

  @Post('revoke-others')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Encerra todas as sessões, menos a atual' })
  @ZodResponse({ type: RevokeOthersResultDto })
  async revokeOthers(@CurrentUser() user: AuthenticatedUser) {
    return { revoked: await this.sessions.revokeOthers(user.id, user.sessionId, this.clock.now()) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Encerra uma sessão (se for a atual, equivale a sair)' })
  async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.sessions.revoke(user.id, id, this.clock.now());
    if (id === user.sessionId) {
      res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions(this.config.get('COOKIE_SECURE')));
    }
  }
}
