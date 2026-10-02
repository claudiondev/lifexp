import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { REFRESH_COOKIE_NAME, refreshCookieOptions } from '../auth/refresh-cookie.js';
import type { Env } from '../config/env.schema.js';
import { AccountService } from './account.service.js';
import {
  AccountExportDto,
  DeleteAccountDto,
  UpdateProfileDto,
  UserResponseDto,
} from './users.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly account: AccountService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Retorna o usuário autenticado' })
  @ZodResponse({ type: UserResponseDto })
  me(@CurrentUser() user: AuthenticatedUser): Promise<UserResponseDto> {
    return this.usersService.getById(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Edita nome, fuso horário ou emblema do usuário autenticado' })
  @ZodResponse({ type: UserResponseDto })
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() body: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, body);
  }

  @Get('me/export')
  @UseGuards(ThrottlerGuard)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Exporta todos os dados da pessoa em JSON (sem credenciais), para baixar',
  })
  @ZodResponse({ type: AccountExportDto })
  async exportMe(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { body, fileName } = await this.account.export(user.id);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return body;
  }

  @Post('me/delete')
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Exclui a conta e todos os dados dela, depois de confirmar a senha (irreversível)',
  })
  async deleteMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: DeleteAccountDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.account.deleteAccount(user.id, body.password);
    res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions(this.config.get('COOKIE_SECURE')));
  }
}
