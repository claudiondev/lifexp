import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { HealthResponse, JobsHealth } from '@lifexp/shared';
import { JobMonitor } from '../observability/job-monitor.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Quanto esperar o banco responder antes de dizer que a API não está pronta. */
export const READY_TIMEOUT_MS = 2000;

@Injectable()
export class HealthService {
  constructor(
    private readonly jobMonitor: JobMonitor,
    private readonly prisma: PrismaService,
  ) {}

  check(): HealthResponse {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /**
   * "Pronta para receber tráfego": o banco responde. Diferente de `check` (o processo está de pé), serve ao balanceador
   * e ao deploy para só mandar pedidos a uma instância que consegue atendê-los. Não vaza o motivo da falha.
   */
  async ready(timeoutMs: number = READY_TIMEOUT_MS): Promise<HealthResponse> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
        }),
      ]);
      return { status: 'ok', timestamp: new Date().toISOString() };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        timestamp: new Date().toISOString(),
      });
    } finally {
      clearTimeout(timer);
    }
  }

  jobs(): JobsHealth {
    return this.jobMonitor.snapshot();
  }
}
