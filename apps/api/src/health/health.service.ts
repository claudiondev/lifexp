import { Injectable } from '@nestjs/common';
import type { HealthResponse, JobsHealth } from '@lifexp/shared';
import { JobMonitor } from '../observability/job-monitor.js';

@Injectable()
export class HealthService {
  constructor(private readonly jobMonitor: JobMonitor) {}

  check(): HealthResponse {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  jobs(): JobsHealth {
    return this.jobMonitor.snapshot();
  }
}
