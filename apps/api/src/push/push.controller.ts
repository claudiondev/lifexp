import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ZodResponse, createZodDto } from 'nestjs-zod';
import {
  pushConfigSchema,
  pushStatusSchema,
  pushSubscriptionInputSchema,
  pushTestResultSchema,
  pushUnsubscribeSchema,
} from '@lifexp/shared';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { PushSubscriptionsService } from './push-subscriptions.service.js';

class PushConfigDto extends createZodDto(pushConfigSchema) {}
class PushStatusDto extends createZodDto(pushStatusSchema) {}
class PushTestResultDto extends createZodDto(pushTestResultSchema) {}
class SubscribeDto extends createZodDto(pushSubscriptionInputSchema) {}
class UnsubscribeDto extends createZodDto(pushUnsubscribeSchema) {}

@ApiTags('push')
@ApiBearerAuth()
@Controller('push')
export class PushController {
  constructor(private readonly subscriptions: PushSubscriptionsService) {}

  @Get('config')
  @ApiOperation({ summary: 'O push está ligado neste servidor? Traz a chave pública VAPID' })
  @ZodResponse({ type: PushConfigDto })
  config() {
    return this.subscriptions.config();
  }

  @Get('subscriptions')
  @ApiOperation({ summary: 'Quantos aparelhos da pessoa estão inscritos' })
  @ZodResponse({ type: PushStatusDto })
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptions.status(user.id);
  }

  @Post('subscriptions')
  @ApiOperation({ summary: 'Inscreve este aparelho para receber push (até 10)' })
  @ZodResponse({ status: HttpStatus.CREATED, type: PushStatusDto })
  subscribe(@CurrentUser() user: AuthenticatedUser, @Body() body: SubscribeDto) {
    return this.subscriptions.subscribe(user.id, body);
  }

  @Delete('subscriptions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancela a inscrição deste aparelho (idempotente)' })
  async unsubscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UnsubscribeDto,
  ): Promise<void> {
    await this.subscriptions.unsubscribe(user.id, body.endpoint);
  }

  // Cada teste vai a serviços externos: o limite por IP evita transformar a rota em disparador.
  @Post('test')
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Envia um aviso de teste aos aparelhos da pessoa' })
  @ZodResponse({ type: PushTestResultDto })
  test(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptions.sendTest(user.id);
  }
}
