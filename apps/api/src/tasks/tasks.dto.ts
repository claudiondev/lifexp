import { createZodDto } from 'nestjs-zod';
import {
  createTaskItemSchema,
  createTaskSchema,
  listTasksQuerySchema,
  taskCompletionResultSchema,
  taskListSchema,
  taskSchema,
  taskUndoResultSchema,
  updateTaskItemSchema,
  updateTaskSchema,
} from '@lifexp/shared';

export class TaskDto extends createZodDto(taskSchema) {}
export class TaskListDto extends createZodDto(taskListSchema) {}
export class ListTasksQueryDto extends createZodDto(listTasksQuerySchema) {}
export class CreateTaskDto extends createZodDto(createTaskSchema) {}
export class UpdateTaskDto extends createZodDto(updateTaskSchema) {}
export class CreateTaskItemDto extends createZodDto(createTaskItemSchema) {}
export class UpdateTaskItemDto extends createZodDto(updateTaskItemSchema) {}
export class TaskCompletionResultDto extends createZodDto(taskCompletionResultSchema) {}
export class TaskUndoResultDto extends createZodDto(taskUndoResultSchema) {}
