import { Global, Module } from '@nestjs/common';
import { JobMonitor } from './job-monitor.js';

@Global()
@Module({ providers: [JobMonitor], exports: [JobMonitor] })
export class ObservabilityModule {}
