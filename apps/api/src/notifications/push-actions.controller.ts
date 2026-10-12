import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ZodResponse } from 'nestjs-zod';
import { Public } from '../auth/public.decorator.js';
import { PushActionRequestDto, PushActionResultDto } from './push-actions.dto.js';
import { PushActionsService } from './push-actions.service.js';

/**
 * Rota pública (RF41): quem chama é o service worker, sem sessão. O token no corpo é a credencial
 * (como o link de recuperação de senha); o limite por IP evita adivinhação por força bruta.
 */
@ApiTags('push-actions')
@Public()
@UseGuards(ThrottlerGuard)
@Controller('push-actions')
export class PushActionsController {
  constructor(private readonly actions: PushActionsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marca "Cumpri" ou "Pulei" pelo botão da notificação de check-in' })
  @ZodResponse({ type: PushActionResultDto })
  act(@Body() body: PushActionRequestDto) {
    return this.actions.act(body.token, body.action);
  }
}
