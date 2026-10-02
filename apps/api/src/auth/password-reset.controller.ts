import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ForgotPasswordDto, ResetPasswordDto } from './auth.dto.js';
import { PasswordResetService } from './password-reset.service.js';
import { Public } from './public.decorator.js';

@ApiTags('auth')
@Public()
@UseGuards(ThrottlerGuard)
@Controller('auth')
export class PasswordResetController {
  constructor(private readonly passwordReset: PasswordResetService) {}

  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Pede o e-mail de recuperação de senha (responde igual, exista ou não a conta)',
  })
  async forgot(@Body() body: ForgotPasswordDto): Promise<void> {
    await this.passwordReset.request(body);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Redefine a senha com o token do e-mail e encerra as sessões' })
  async reset(@Body() body: ResetPasswordDto): Promise<void> {
    await this.passwordReset.reset(body);
  }
}
