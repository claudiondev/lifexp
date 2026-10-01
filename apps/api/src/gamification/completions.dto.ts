import { createZodDto } from 'nestjs-zod';
import { completionResultSchema, undoResultSchema } from '@lifexp/shared';

export class CompletionResultDto extends createZodDto(completionResultSchema) {}
export class UndoResultDto extends createZodDto(undoResultSchema) {}
