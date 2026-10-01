import { Module } from '@nestjs/common';
import { CompletionsController } from './completions.controller.js';
import { CompletionsService } from './completions.service.js';

@Module({
  controllers: [CompletionsController],
  providers: [CompletionsService],
})
export class GamificationModule {}
