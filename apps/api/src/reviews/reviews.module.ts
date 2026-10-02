import { Module } from '@nestjs/common';
import { BlocksModule } from '../blocks/blocks.module.js';
import { GamificationModule } from '../gamification/gamification.module.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import { ReviewsController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';

@Module({
  imports: [BlocksModule, GamificationModule],
  controllers: [ReviewsController, ReportsController],
  providers: [ReviewsService, ReportsService],
  exports: [ReportsService],
})
export class ReviewsModule {}
