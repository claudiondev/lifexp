import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { UpdateProfileDto, UserResponseDto } from './users.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
}
