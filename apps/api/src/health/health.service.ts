import { Injectable } from '@nestjs/common';
import type { HealthResponse } from '@lifexp/shared';

@Injectable()
export class HealthService {
  check(): HealthResponse {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
