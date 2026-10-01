import { Module } from '@nestjs/common';
import { ActivitiesController } from './activities.controller.js';
import { ActivitiesService } from './activities.service.js';
import { AreasController } from './areas.controller.js';
import { AreasService } from './areas.service.js';

@Module({
  controllers: [AreasController, ActivitiesController],
  providers: [AreasService, ActivitiesService],
})
export class AreasModule {}
