import { createZodDto } from 'nestjs-zod';
import { healthResponseSchema, jobsHealthSchema } from '@lifexp/shared';

// O schema vive em packages/shared; aqui ele só vira DTO (para Swagger/serialização).
export class HealthResponseDto extends createZodDto(healthResponseSchema) {}
export class JobsHealthDto extends createZodDto(jobsHealthSchema) {}
