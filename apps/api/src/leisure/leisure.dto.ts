import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  createLeisureOptionSchema,
  leisureOptionSchema,
  leisureSessionSchema,
  leisureSummarySchema,
  listLeisureOptionsQuerySchema,
  startLeisureSessionSchema,
  updateLeisureOptionSchema,
} from '@lifexp/shared';

export class LeisureOptionDto extends createZodDto(leisureOptionSchema) {}
export class LeisureOptionListDto extends createZodDto(z.array(leisureOptionSchema)) {}
export class LeisureSessionDto extends createZodDto(leisureSessionSchema) {}
export class LeisureSummaryDto extends createZodDto(leisureSummarySchema) {}
export class ListLeisureOptionsQueryDto extends createZodDto(listLeisureOptionsQuerySchema) {}
export class CreateLeisureOptionDto extends createZodDto(createLeisureOptionSchema) {}
export class UpdateLeisureOptionDto extends createZodDto(updateLeisureOptionSchema) {}
export class StartLeisureSessionDto extends createZodDto(startLeisureSessionSchema) {}
