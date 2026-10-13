import { Module } from '@nestjs/common';
import { GamificationModule } from '../gamification/gamification.module.js';
import { LeisureController } from './leisure.controller.js';
import { LeisureOptionsService } from './leisure-options.service.js';
import { LeisureService } from './leisure.service.js';

@Module({
  imports: [GamificationModule],
  controllers: [LeisureController],
  providers: [LeisureService, LeisureOptionsService],
})
export class LeisureModule {}
