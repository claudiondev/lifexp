import { createZodDto } from 'nestjs-zod';
import { healthResponseSchema } from '@lifexp/shared';

// O schema vive em packages/shared; aqui ele só vira DTO (para Swagger/serialização).
export class HealthResponseDto extends createZodDto(healthResponseSchema) {}
