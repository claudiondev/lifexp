import { Module } from '@nestjs/common';
import { BlocksModule } from '../blocks/blocks.module.js';
import { AchievementsController } from './achievements.controller.js';
import { AchievementsService } from './achievements.service.js';
import { BalanceController } from './balance.controller.js';
import { BalanceService } from './balance.service.js';
import { CacheRebuildService } from './cache-rebuild.service.js';
import { CompletionsController } from './completions.controller.js';
import { ConsistencyController } from './consistency.controller.js';
import { ConsistencyService } from './consistency.service.js';
import { CompletionsService } from './completions.service.js';
import { OccurrenceHistoryService } from './occurrence-history.service.js';
import { ProgressController } from './progress.controller.js';
import { ProgressService } from './progress.service.js';
import { QuestService } from './quest.service.js';
import { QuestsController } from './quests.controller.js';
import { QuestsScheduler } from './quests.scheduler.js';
import { RewardsController } from './rewards.controller.js';
import { RewardsService } from './rewards.service.js';
import { StreakService } from './streak.service.js';
import { XpLedgerService } from './xp-ledger.service.js';
import { TodayService } from './today.service.js';
import { XpEvolutionController } from './xp-evolution.controller.js';
import { XpEvolutionService } from './xp-evolution.service.js';
import { XpHistoryController } from './xp-history.controller.js';
import { XpHistoryService } from './xp-history.service.js';

@Module({
  imports: [BlocksModule],
  controllers: [
    AchievementsController,
    BalanceController,
    CompletionsController,
    ConsistencyController,
    ProgressController,
    QuestsController,
    RewardsController,
    XpEvolutionController,
    XpHistoryController,
  ],
  providers: [
    CompletionsService,
    ProgressService,
    StreakService,
    OccurrenceHistoryService,
    BalanceService,
    ConsistencyService,
    AchievementsService,
    RewardsService,
    TodayService,
    CacheRebuildService,
    XpLedgerService,
    XpHistoryService,
    XpEvolutionService,
    QuestService,
    QuestsScheduler,
  ],
  exports: [
    CacheRebuildService,
    XpLedgerService,
    QuestService,
    QuestsScheduler,
    AchievementsService,
    OccurrenceHistoryService,
    CompletionsService,
  ],
})
export class GamificationModule {}
