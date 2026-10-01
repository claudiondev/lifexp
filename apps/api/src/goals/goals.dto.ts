import { createZodDto } from 'nestjs-zod';
import {
  createGoalSchema,
  createMilestoneSchema,
  goalSchema,
  listGoalsQuerySchema,
  setGoalStatusSchema,
  updateGoalSchema,
  updateMilestoneSchema,
} from '@lifexp/shared';

export class GoalDto extends createZodDto(goalSchema) {}
export class CreateGoalDto extends createZodDto(createGoalSchema) {}
export class UpdateGoalDto extends createZodDto(updateGoalSchema) {}
export class SetGoalStatusDto extends createZodDto(setGoalStatusSchema) {}
export class ListGoalsQueryDto extends createZodDto(listGoalsQuerySchema) {}
export class CreateMilestoneDto extends createZodDto(createMilestoneSchema) {}
export class UpdateMilestoneDto extends createZodDto(updateMilestoneSchema) {}
