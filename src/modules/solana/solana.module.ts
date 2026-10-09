import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HeliusService } from './helius/helius.service';
import { OgService } from './og/og.service';
import { OgController } from './og/og.controller';
import { KnownEntityService } from './wallet-graph/known-entity.service';
import { WalletGraphService } from './wallet-graph/wallet-graph.service';
import { WalletGraphProcessor } from './wallet-graph/wallet-graph.processor';
import { WalletGraphController } from './wallet-graph/wallet-graph.controller';
import { SOL_GRAPH_QUEUE_NAME } from './solana.constants';

@Module({
  // RateLimitModule & PrismaModule are @Global, so they're not imported here.
  imports: [BullModule.registerQueue({ name: SOL_GRAPH_QUEUE_NAME })],
  controllers: [OgController, WalletGraphController],
  providers: [
    HeliusService,
    OgService,
    KnownEntityService,
    WalletGraphService,
    WalletGraphProcessor,
  ],
})
export class SolanaModule {}
