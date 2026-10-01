import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import type { Env } from '../config/env.schema.js';

/**
 * Prisma 7 exige um driver adapter. A conexão é preguiçosa: só abre no primeiro uso,
 * por isso o boot da API não depende do banco estar no ar.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg({ connectionString: config.get('DATABASE_URL') }),
      // Só emite eventos (sem imprimir): permite contar queries nos testes de desempenho (RNF04).
      log: [{ emit: 'event', level: 'query' }],
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
