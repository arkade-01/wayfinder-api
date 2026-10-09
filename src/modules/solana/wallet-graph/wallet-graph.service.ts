import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { GRAPH_VERSION, SOL_GRAPH_QUEUE_NAME } from '../solana.constants';
import { WalletGraphJobData } from './wallet-graph.processor';

const RESULT_TTL_MS = 12 * 60 * 60 * 1000;

@Injectable()
export class WalletGraphService {
  constructor(
    @InjectQueue(SOL_GRAPH_QUEUE_NAME) private readonly queue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  /** Queues a scan, or returns a recent completed one for the same address. */
  async create(address: string, force = false) {
    if (!force) {
      const recent = await this.prisma.solWalletScan.findFirst({
        where: {
          address,
          status: 'COMPLETE',
          createdAt: { gte: new Date(Date.now() - RESULT_TTL_MS) },
        },
        orderBy: { createdAt: 'desc' },
      });
      const recentVersion = (recent?.result as { version?: number } | null)
        ?.version;
      if (recent && recentVersion === GRAPH_VERSION)
        return {
          scanId: recent.id,
          status: recent.status,
          address,
          cached: true,
        };
    }

    const scan = await this.prisma.solWalletScan.create({
      data: { address, status: 'PENDING' },
    });
    const data: WalletGraphJobData = { scanId: scan.id, address };
    await this.queue.add('wallet-graph', data, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    });
    return { scanId: scan.id, status: 'PENDING', address, cached: false };
  }

  async findOne(scanId: string) {
    const scan = await this.prisma.solWalletScan.findUnique({
      where: { id: scanId },
    });
    if (!scan)
      throw new NotFoundException(`Solana wallet scan ${scanId} not found`);
    return scan;
  }

  /** All stored links touching an address, from any scan (both directions). */
  async edgesFor(address: string) {
    return this.prisma.walletEdge.findMany({
      where: { chain: 'solana', OR: [{ from: address }, { to: address }] },
      orderBy: { weight: 'desc' },
      take: 200,
    });
  }
}
