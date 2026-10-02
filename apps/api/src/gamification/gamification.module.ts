import { Module } from '@nestjs/common';
import { BlocksModule } from '../blocks/blocks.module.js';
import { CacheRebuildService } from './cache-rebuild.service.js';
import { CompletionsController } from './completions.controller.js';
import { CompletionsService } from './completions.service.js';
import { ProgressController } from './progress.controller.js';
import { ProgressService } from './progress.service.js';
import { StreakService } from './streak.service.js';
import { XpLedgerService } from './xp-ledger.service.js';
import { TodayService } from './today.service.js';
import { XpHistoryController } from './xp-history.controller.js';
import { XpHistoryService } from './xp-history.service.js';

@Module({
  imports: [BlocksModule],
  controllers: [CompletionsController, ProgressController, XpHistoryController],
  providers: [
    CompletionsService,
    ProgressService,
    StreakService,
    TodayService,
    CacheRebuildService,
    XpLedgerService,
    XpHistoryService,
  ],
  exports: [CacheRebuildService, XpLedgerService],
})
export class GamificationModule {}
