import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { HeliusService } from '../helius/helius.service';
import { GRAPH_LIMITS, PROGRAM_ACCOUNTS } from '../solana.constants';

const REFRESH_MS = 10 * 60 * 1000;
const HUB_CACHE_MS = 6 * 60 * 60 * 1000;

/**
 * Decides which addresses must never be treated as alts:
 *   1. hardcoded program accounts
 *   2. KnownEntity rows (CEX hot wallets, bridges, relayers — seed these)
 *   3. auto-detected hubs (full page of recent signatures)
 */
@Injectable()
export class KnownEntityService {
  private readonly logger = new Logger(KnownEntityService.name);
  private known = new Map<string, { label: string; kind: string }>();
  private loadedAt = 0;
  private hubCache = new Map<string, { hub: boolean; at: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly helius: HeliusService,
  ) {}

  private async refresh() {
    if (Date.now() - this.loadedAt < REFRESH_MS) return;
    try {
      const rows = await this.prisma.knownEntity.findMany({
        where: { chain: 'solana' },
      });
      this.known = new Map(
        rows.map((r) => [r.address, { label: r.label, kind: r.kind }]),
      );
      this.loadedAt = Date.now();
    } catch (e: any) {
      this.logger.warn(`KnownEntity load failed: ${e.message}`);
    }
  }

  async label(
    address: string,
  ): Promise<{ label: string; kind: string } | null> {
    if (PROGRAM_ACCOUNTS.has(address))
      return { label: 'program', kind: 'program' };
    await this.refresh();
    return this.known.get(address) ?? null;
  }

  /** Static exclusion only (no RPC). */
  async isKnown(address: string): Promise<boolean> {
    return (await this.label(address)) !== null;
  }

  /** Static exclusion + fan-out hub detection (one cheap RPC call, cached). */
  async isExcluded(address: string): Promise<boolean> {
    if (await this.isKnown(address)) return true;

    const cached = this.hubCache.get(address);
    if (cached && Date.now() - cached.at < HUB_CACHE_MS) return cached.hub;

    let hub = false;
    try {
      hub = await this.helius.isHighFanOut(
        address,
        GRAPH_LIMITS.hubSignatureThreshold,
      );
    } catch (e: any) {
      this.logger.warn(`Hub check failed for ${address}: ${e.message}`);
    }
    this.hubCache.set(address, { hub, at: Date.now() });
    return hub;
  }
}
