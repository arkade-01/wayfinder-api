import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../../../prisma/prisma.service';
import { HeliusService } from '../helius/helius.service';

export interface OgToken {
  mint: string;
  name: string;
  symbol: string;
  icon: string | null;
  /** On-chain creation time of the mint (first tx). Null if lookup failed. */
  mintCreatedAt: string | null;
  /** First pool creation — often months after mint; shown for comparison only. */
  firstPoolAt: string | null;
  creationSignature: string | null;
  creator: string | null;
  liquidityUsd: number;
  marketCapUsd: number;
  holders: number | null;
  verified: boolean;
  matchType: 'exact' | 'partial';
  isOg: boolean;
}

export interface OgSearchResult {
  query: string;
  og: OgToken | null;
  results: OgToken[];
  note?: string;
}

interface RawCandidate {
  mint: string;
  name: string;
  symbol: string;
  icon: string | null;
  firstPoolAt: string | null;
  creator: string | null;
  liquidityUsd: number;
  marketCapUsd: number;
  holders: number | null;
  verified: boolean;
}

const MAX_CANDIDATES = 30;
const LOOKUP_CONCURRENCY = 5;

@Injectable()
export class OgService {
  private readonly logger = new Logger(OgService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly helius: HeliusService,
  ) {}

  async search(
    rawQuery: string,
    opts: { minLiquidityUsd: number },
  ): Promise<OgSearchResult> {
    const query = rawQuery.trim().replace(/^\$/, '');
    const [jup, dex] = await Promise.all([
      this.fromJupiter(query),
      this.fromDexScreener(query),
    ]);

    // Merge by mint; Jupiter data wins (has holders / creator / verification).
    const byMint = new Map<string, RawCandidate>();
    for (const c of [...dex, ...jup]) {
      const prev = byMint.get(c.mint);
      byMint.set(
        c.mint,
        prev
          ? {
              ...prev,
              ...stripNulls(c),
              liquidityUsd: Math.max(prev.liquidityUsd, c.liquidityUsd),
            }
          : c,
      );
    }

    const q = query.toLowerCase();
    const candidates = [...byMint.values()]
      .map((c) => ({ c, matchType: matchType(c, q) }))
      .filter(
        (x): x is { c: RawCandidate; matchType: 'exact' | 'partial' } =>
          x.matchType !== null,
      )
      .filter((x) => x.c.liquidityUsd >= opts.minLiquidityUsd)
      .sort((a, b) => b.c.liquidityUsd - a.c.liquidityUsd)
      .slice(0, MAX_CANDIDATES);

    const origins = await mapLimit(candidates, LOOKUP_CONCURRENCY, ({ c }) =>
      this.mintOrigin(c.mint),
    );

    const results: OgToken[] = candidates.map(({ c, matchType }, i) => ({
      mint: c.mint,
      name: c.name,
      symbol: c.symbol,
      icon: c.icon,
      mintCreatedAt: origins[i]?.createdAt?.toISOString() ?? null,
      firstPoolAt: c.firstPoolAt,
      creationSignature: origins[i]?.signature ?? null,
      creator: c.creator,
      liquidityUsd: c.liquidityUsd,
      marketCapUsd: c.marketCapUsd,
      holders: c.holders,
      verified: c.verified,
      matchType,
      isOg: false,
    }));

    // OG = oldest exact match; fall back to oldest partial match.
    const dated = (t: OgToken) =>
      t.mintCreatedAt ? Date.parse(t.mintCreatedAt) : Infinity;
    results.sort((a, b) => dated(a) - dated(b));
    const og =
      results.find((r) => r.matchType === 'exact' && r.mintCreatedAt) ??
      results.find((r) => r.mintCreatedAt) ??
      null;
    if (og) og.isOg = true;

    return {
      query,
      og,
      results,
      ...(results.length === 0
        ? { note: 'No Solana tokens matched (try lowering minLiquidity)' }
        : {}),
    };
  }

  /** Mint creation time from its oldest tx. Cached forever (it can't change). */
  private async mintOrigin(
    mint: string,
  ): Promise<{ createdAt: Date | null; signature: string | null } | null> {
    const hit = await this.prisma.solMintOrigin.findUnique({ where: { mint } });
    if (hit)
      return {
        createdAt: hit.createdAtChain,
        signature: hit.creationSignature,
      };

    try {
      const oldest = await this.helius.getOldestSignature(mint);
      const createdAt = oldest?.blockTime
        ? new Date(oldest.blockTime * 1000)
        : null;
      await this.prisma.solMintOrigin.upsert({
        where: { mint },
        create: {
          mint,
          createdAtChain: createdAt,
          creationSignature: oldest?.signature ?? null,
          creationSlot: oldest?.slot ?? null,
        },
        update: {},
      });
      return { createdAt, signature: oldest?.signature ?? null };
    } catch (e: any) {
      this.logger.warn(`Mint origin lookup failed for ${mint}: ${e.message}`);
      return null; // don't cache failures
    }
  }

  // ── Sources ───────────────────────────────────────────────────────────────

  private async fromJupiter(query: string): Promise<RawCandidate[]> {
    try {
      const { data } = await axios.get(
        'https://lite-api.jup.ag/tokens/v2/search',
        {
          params: { query },
          timeout: 10_000,
        },
      );
      return (Array.isArray(data) ? data : []).map((t: any) => ({
        mint: t.id,
        name: t.name ?? '',
        symbol: t.symbol ?? '',
        icon: t.icon ?? null,
        firstPoolAt: t.firstPool?.createdAt ?? null,
        creator: t.dev ?? null,
        liquidityUsd: Number(t.liquidity ?? 0),
        marketCapUsd: Number(t.mcap ?? t.fdv ?? 0),
        holders: t.holderCount ?? null,
        verified: !!t.isVerified,
      }));
    } catch (e: any) {
      this.logger.warn(`Jupiter search failed: ${e.message}`);
      return [];
    }
  }

  private async fromDexScreener(query: string): Promise<RawCandidate[]> {
    try {
      const { data } = await axios.get(
        'https://api.dexscreener.com/latest/dex/search',
        {
          params: { q: query },
          timeout: 10_000,
        },
      );
      return (data?.pairs ?? [])
        .filter((p: any) => p.chainId === 'solana' && p.baseToken?.address)
        .map((p: any) => ({
          mint: p.baseToken.address,
          name: p.baseToken.name ?? '',
          symbol: p.baseToken.symbol ?? '',
          icon: p.info?.imageUrl ?? null,
          firstPoolAt: p.pairCreatedAt
            ? new Date(p.pairCreatedAt).toISOString()
            : null,
          creator: null,
          liquidityUsd: Number(p.liquidity?.usd ?? 0),
          marketCapUsd: Number(p.marketCap ?? p.fdv ?? 0),
          holders: null,
          verified: false,
        }));
    } catch (e: any) {
      this.logger.warn(`DexScreener search failed: ${e.message}`);
      return [];
    }
  }
}

function matchType(
  c: { name: string; symbol: string },
  q: string,
): 'exact' | 'partial' | null {
  const sym = c.symbol.toLowerCase();
  const name = c.name.toLowerCase();
  if (sym === q || name === q) return 'exact';
  if (sym.includes(q) || name.includes(q)) return 'partial';
  return null;
}

function stripNulls<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== null && v !== ''),
  ) as Partial<T>;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    },
  );
  await Promise.all(workers);
  return out;
}
