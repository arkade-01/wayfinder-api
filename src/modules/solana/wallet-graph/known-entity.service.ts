import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { HeliusService } from '../helius/helius.service';
import {
  GRAPH_LIMITS,
  PROGRAM_ACCOUNTS,
  SYSTEM_PROGRAM_ID,
} from '../solana.constants';
import { AddressProfile, describeHub, profileAddress } from './signals';

const REFRESH_MS = 10 * 60 * 1000;
const HUB_CACHE_MS = 6 * 60 * 60 * 1000;

/**
 * Decides which addresses must never be treated as alts:
 *   1. hardcoded program accounts
 *   2. KnownEntity rows (CEX hot wallets, bridges, relayers — seed these)
 *   3. auto-detected hubs — judged by counterparty spread, not activity, so
 *      busy degen/trading-bot wallets are kept (see profileAddress)
 */
@Injectable()
export class KnownEntityService {
  private readonly logger = new Logger(KnownEntityService.name);
  private known = new Map<string, { label: string; kind: string }>();
  private loadedAt = 0;
  private profileCache = new Map<string, { p: AddressProfile; at: number }>();

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

  /** Behavioural profile of an address from its recent txs (cached 6h). */
  async profile(address: string): Promise<AddressProfile | null> {
    const cached = this.profileCache.get(address);
    if (cached && Date.now() - cached.at < HUB_CACHE_MS) return cached.p;

    try {
      const [recent, busy] = await Promise.all([
        this.helius.getParsedHistory(address, {
          sortOrder: 'desc',
          max: GRAPH_LIMITS.hubSampleTxs,
        }),
        this.helius
          .isHighFanOut(address, GRAPH_LIMITS.hubSignatureThreshold)
          .catch(() => false),
      ]);
      const counterparties = recent.flatMap((t) =>
        t.nativeTransfers.flatMap((n) => [n.from, n.to]),
      );
      const owners = await this.helius.getOwners(
        counterparties.filter((a) => a !== address && !PROGRAM_ACCOUNTS.has(a)),
      );
      // Only live system-owned accounts count; closed (null) is unknown → not counted.
      const isWallet = (a: string) => owners.get(a) === SYSTEM_PROGRAM_ID;
      const p = profileAddress(address, recent, isWallet, GRAPH_LIMITS, busy);
      this.profileCache.set(address, { p, at: Date.now() });
      return p;
    } catch (e: any) {
      this.logger.warn(`Profile failed for ${address}: ${e.message}`);
      return null; // fail open: keep the address rather than silently drop it
    }
  }

  /** Why an address must be excluded, or null if it's usable as an alt. */
  async exclusionReason(address: string): Promise<string | null> {
    const label = await this.label(address);
    if (label) return `${label.kind}: ${label.label}`;
    const p = await this.profile(address);
    return p ? describeHub(p) : null;
  }
}
