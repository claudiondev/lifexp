import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Public } from '../auth/public.decorator.js';
import { HealthResponseDto } from './health.dto.js';
import { HealthService } from './health.service.js';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Verifica se a API está no ar' })
  @ZodResponse({ type: HealthResponseDto })
  check(): HealthResponseDto {
    return this.healthService.check();
  }
}
