import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Public } from '../auth/public.decorator.js';
import { HealthResponseDto, JobsHealthDto } from './health.dto.js';
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

  @Get('ready')
  @ApiOperation({
    summary: 'A API está pronta para receber tráfego? (confere o banco; 503 se não)',
  })
  @ZodResponse({ type: HealthResponseDto })
  ready(): Promise<HealthResponseDto> {
    return this.healthService.ready();
  }

  @Get('jobs')
  @ApiOperation({
    summary:
      'Estado dos jobs agendados (última execução, última vez que deu certo, falhas seguidas)',
  })
  @ZodResponse({ type: JobsHealthDto })
  jobs(): JobsHealthDto {
    return this.healthService.jobs();
  }
}
