import { createZodDto } from 'nestjs-zod';
import {
  activitySchema,
  createActivitySchema,
  listActivitiesQuerySchema,
  updateActivitySchema,
} from '@lifexp/shared';

export class ActivityDto extends createZodDto(activitySchema) {}
export class CreateActivityDto extends createZodDto(createActivitySchema) {}
export class UpdateActivityDto extends createZodDto(updateActivitySchema) {}
export class ListActivitiesQueryDto extends createZodDto(listActivitiesQuerySchema) {}
