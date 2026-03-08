import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';

import { PrismaService } from './prisma/prisma.service';
import { CacheService } from './modules/cache/cache.service';
import { IdentityService } from './modules/identity/identity.service';
import { IdentityController } from './modules/identity/identity.controller';
import { BridgeService } from './modules/bridge/bridge.service';
import { BridgeController } from './modules/bridge/bridge.controller';
import { ReportService } from './modules/report/report.service';
import { ScanService } from './modules/scan/scan.service';
import { BulkScanService } from './modules/scan/bulk-scan.service';
import { ScanProcessor } from './modules/scan/scan.processor';
import { ScanController } from './modules/scan/scan.controller';
import { RateLimitModule } from './modules/ratelimit/ratelimit.module';
import { SCAN_QUEUE_NAME } from './common/constants/bridges';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({ isGlobal: true }),

    // Rate limiting
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 30 }]),

    // BullMQ — job queue backed by Redis
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),

    BullModule.registerQueue({ name: SCAN_QUEUE_NAME }),

    // Rate limiting per scan type
    RateLimitModule,
  ],

  controllers: [IdentityController, BridgeController, ScanController],

  providers: [
    PrismaService,
    CacheService,
    IdentityService,
    BridgeService,
    ReportService,
    ScanService,
    BulkScanService,
    ScanProcessor,
  ],
})
export class AppModule {}
