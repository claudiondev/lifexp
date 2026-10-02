import { createZodDto } from 'nestjs-zod';
import {
  blockExceptionSchema,
  blockSchema,
  createBlockSchema,
  createWeeklyBlocksSchema,
  deleteBlockQuerySchema,
  putExceptionSchema,
  updateBlockSchema,
  weekQuerySchema,
  weekResponseSchema,
} from '@lifexp/shared';

export class BlockDto extends createZodDto(blockSchema) {}
/**
 * Corpos que são uniões discriminadas não podem virar `class X extends createZodDto(...)` (o
 * TypeScript não estende união). Aqui o DTO só alimenta o Swagger; a validação roda com o schema
 * explícito no controller (`new ZodValidationPipe(schema)`).
 */
export const CreateBlockDto = createZodDto(createBlockSchema);
export class CreateWeeklyBlocksDto extends createZodDto(createWeeklyBlocksSchema) {}
export class UpdateBlockDto extends createZodDto(updateBlockSchema) {}
export class DeleteBlockQueryDto extends createZodDto(deleteBlockQuerySchema) {}
export const PutExceptionDto = createZodDto(putExceptionSchema);
export class BlockExceptionDto extends createZodDto(blockExceptionSchema) {}
export class WeekQueryDto extends createZodDto(weekQuerySchema) {}
export class WeekResponseDto extends createZodDto(weekResponseSchema) {}
