import { createZodDto } from 'nestjs-zod';
import {
  areaSchema,
  createAreaSchema,
  listAreasQuerySchema,
  updateAreaSchema,
} from '@lifexp/shared';

export class AreaDto extends createZodDto(areaSchema) {}
export class CreateAreaDto extends createZodDto(createAreaSchema) {}
export class UpdateAreaDto extends createZodDto(updateAreaSchema) {}
export class ListAreasQueryDto extends createZodDto(listAreasQuerySchema) {}
