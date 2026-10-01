import { Module } from '@nestjs/common';
import { BlocksModule } from '../blocks/blocks.module.js';
import { CompletionsController } from './completions.controller.js';
import { CompletionsService } from './completions.service.js';
import { ProgressController } from './progress.controller.js';
import { ProgressService } from './progress.service.js';
import { TodayService } from './today.service.js';

@Module({
  imports: [BlocksModule],
  controllers: [CompletionsController, ProgressController],
  providers: [CompletionsService, ProgressService, TodayService],
})
export class GamificationModule {}
