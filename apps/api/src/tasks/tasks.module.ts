import { Module } from '@nestjs/common';
import { GamificationModule } from '../gamification/gamification.module.js';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';

@Module({
  imports: [GamificationModule],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
