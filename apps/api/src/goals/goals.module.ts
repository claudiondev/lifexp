import { Module } from '@nestjs/common';
import { GamificationModule } from '../gamification/gamification.module.js';
import { GoalsController } from './goals.controller.js';
import { GoalsService } from './goals.service.js';

@Module({
  imports: [GamificationModule],
  controllers: [GoalsController],
  providers: [GoalsService],
  exports: [GoalsService],
})
export class GoalsModule {}
