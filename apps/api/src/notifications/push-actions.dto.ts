import { createZodDto } from 'nestjs-zod';
import { pushActionRequestSchema, pushActionResultSchema } from '@lifexp/shared';

export class PushActionRequestDto extends createZodDto(pushActionRequestSchema) {}
export class PushActionResultDto extends createZodDto(pushActionResultSchema) {}
