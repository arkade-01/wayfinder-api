import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { HeliusService } from '../helius/helius.service';
import { KnownEntityService } from './known-entity.service';
import {
  CandidateSet,
  Candidate,
  counterparties,
  feePayersFor,
  firstFunderOf,
} from './signals';
import {
  GRAPH_LIMITS,
  SIGNAL_WEIGHTS,
  SOL_GRAPH_QUEUE_NAME,
} from '../solana.constants';

export interface WalletGraphJobData {
  scanId: string;
  address: string;
}

export interface WalletGraphResult {
  address: string;
  funder: {
    address: string;
    signature: string;
    sol: number;
    excluded: boolean;
    label?: string;
  } | null;
  candidates: Candidate[];
  excluded: { address: string; reason: string }[];
  stats: { txsScanned: number; candidatesChecked: number };
  depth: 1;
  scannedAt: string;
}

const SYSTEM_PROGRAM = '11111111111111111111111111111111';
const MIN_REPORTED_SCORE = 0.3;
const MAX_REPORTED = 25;

@Processor(SOL_GRAPH_QUEUE_NAME, { concurrency: 2 })
export class WalletGraphProcessor extends WorkerHost {
  private readonly logger = new Logger(WalletGraphProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly helius: HeliusService,
    private readonly entities: KnownEntityService,
  ) {
    super();
  }

  async process(job: Job<WalletGraphJobData>): Promise<WalletGraphResult> {
    const { scanId, address: target } = job.data;
    await this.prisma.solWalletScan.update({
      where: { id: scanId },
      data: { status: 'RUNNING' },
    });

    try {
      const result = await this.scan(target, job);
      await this.persist(scanId, target, result);
      return result;
    } catch (e: any) {
      this.logger.error(`Wallet graph scan ${scanId} failed: ${e.message}`);
      await this.prisma.solWalletScan.update({
        where: { id: scanId },
        data: { status: 'FAILED', error: e.message?.slice(0, 500) },
      });
      throw e;
    }
  }

  private async scan(target: string, job: Job): Promise<WalletGraphResult> {
    const cands = new CandidateSet(target);
    const excluded = new Map<string, string>();
    let checked = 0;

    // ── 1. Target history (oldest for funding, newest for behaviour) ─────────
    await job.updateProgress(5);
    const [oldest, recent] = await Promise.all([
      this.helius.getParsedHistory(target, {
        sortOrder: 'asc',
        max: GRAPH_LIMITS.targetOldestTxs,
      }),
      this.helius.getParsedHistory(target, {
        sortOrder: 'desc',
        max: GRAPH_LIMITS.targetRecentTxs,
      }),
    ]);
    const bySig = new Map([...oldest, ...recent].map((t) => [t.signature, t]));
    const all = [...bySig.values()];

    // Wallet-ness filter: only system-owned accounts can be alts (drops pools, PDAs, vaults).
    const isWallet = async (addr: string) => {
      checked++;
      try {
        const owner = await this.helius.getAccountOwner(addr);
        return owner === null || owner === SYSTEM_PROGRAM; // null = closed/empty system account
      } catch {
        return false;
      }
    };
    const usable = async (addr: string): Promise<boolean> => {
      if (excluded.has(addr)) return false;
      const label = await this.entities.label(addr);
      if (label)
        return (excluded.set(addr, `${label.kind}: ${label.label}`), false);
      if (!(await isWallet(addr)))
        return (
          excluded.set(addr, 'not a wallet (program-owned account)'),
          false
        );
      if (await this.entities.isExcluded(addr))
        return (
          excluded.set(addr, 'high-activity hub (likely CEX/relayer/bot)'),
          false
        );
      return true;
    };

    // ── 2. Funder ───────────────────────────────────────────────────────────
    await job.updateProgress(20);
    const f = firstFunderOf(target, oldest);
    let funder: WalletGraphResult['funder'] = null;
    let funderUsable = false;
    if (f) {
      funderUsable = await usable(f.funder);
      const label = await this.entities.label(f.funder);
      funder = {
        address: f.funder,
        signature: f.signature,
        sol: f.lamports / 1e9,
        excluded: !funderUsable,
        ...(label ? { label: label.label } : {}),
      };
      if (funderUsable) {
        cands.add(f.funder, {
          signal: 'FUNDED_BY',
          signatures: [f.signature],
          detail: `First SOL in: ${funder.sol} SOL`,
        });
      }
    }

    // ── 3. Fee payers ───────────────────────────────────────────────────────
    await job.updateProgress(35);
    for (const [payer, sigs] of feePayersFor(target, all)) {
      if (await usable(payer)) {
        cands.add(payer, {
          signal: 'FEE_PAYER',
          signatures: sigs.slice(0, 5),
          detail: `Paid fees on ${sigs.length} tx(s) signed by target`,
        });
      }
    }

    // ── 4. Sweeps (repeated SOL to/from the same wallet) ────────────────────
    await job.updateProgress(45);
    const { outgoing, incoming } = counterparties(target, all);
    for (const [addr, sigs] of outgoing) {
      if (sigs.length >= GRAPH_LIMITS.sweepMinCount && (await usable(addr))) {
        cands.add(addr, {
          signal: 'SWEEP_OUT',
          signatures: sigs.slice(0, 5),
          detail: `Received SOL from target ${sigs.length}×`,
        });
      }
    }
    for (const [addr, sigs] of incoming) {
      if (sigs.length >= GRAPH_LIMITS.sweepMinCount && (await usable(addr))) {
        cands.add(addr, {
          signal: 'SWEEP_IN',
          signatures: sigs.slice(0, 5),
          detail: `Sent SOL to target ${sigs.length}×`,
        });
      }
    }

    // ── 5. Children: wallets whose FIRST funding came from the target ───────
    await job.updateProgress(60);
    const childCandidates = [...outgoing.keys()].slice(
      0,
      GRAPH_LIMITS.maxChildrenToVerify,
    );
    for (const child of childCandidates) {
      if (excluded.has(child) || (await this.entities.isKnown(child))) continue;
      const childOldest = await this.helius.getParsedHistory(child, {
        sortOrder: 'asc',
        max: 5,
      });
      const cf = firstFunderOf(child, childOldest);
      if (cf?.funder !== target) continue;
      if (await this.forwardsToKnownEntity(child, childOldest)) {
        excluded.set(
          child,
          'likely exchange deposit address (forwards to a known entity)',
        );
        continue;
      }
      if (await usable(child)) {
        cands.add(child, {
          signal: 'FUNDED_CHILD',
          signatures: [cf.signature],
          detail: 'Target made the first SOL deposit into this wallet',
        });
      }
    }

    // ── 6. Siblings: other wallets first-funded by the same (non-hub) funder ─
    await job.updateProgress(75);
    if (f && funderUsable) {
      const funderRecent = await this.helius.getParsedHistory(f.funder, {
        sortOrder: 'desc',
        max: GRAPH_LIMITS.funderRecentTxs,
      });
      const { outgoing: funded } = counterparties(f.funder, funderRecent);
      funded.delete(target);
      let found = 0;
      for (const sib of funded.keys()) {
        if (found >= GRAPH_LIMITS.maxSiblings) break;
        if (excluded.has(sib)) continue;
        const sibOldest = await this.helius.getParsedHistory(sib, {
          sortOrder: 'asc',
          max: 5,
        });
        const sf = firstFunderOf(sib, sibOldest);
        if (sf?.funder !== f.funder) continue;
        if (await this.forwardsToKnownEntity(sib, sibOldest)) continue;
        if (await usable(sib)) {
          cands.add(sib, {
            signal: 'SHARED_FUNDER',
            signatures: [f.signature, sf.signature],
            detail: `Both first funded by ${f.funder}`,
          });
          found++;
        }
      }
    }

    await job.updateProgress(95);
    const candidates = cands
      .ranked()
      .filter((c) => c.score >= MIN_REPORTED_SCORE)
      .slice(0, MAX_REPORTED);

    return {
      address: target,
      funder,
      candidates,
      excluded: [...excluded.entries()].map(([address, reason]) => ({
        address,
        reason,
      })),
      stats: { txsScanned: all.length, candidatesChecked: checked },
      depth: 1,
      scannedAt: new Date().toISOString(),
    };
  }

  /** A fresh wallet that immediately forwards to a CEX/known entity is a deposit address, not an alt. */
  private async forwardsToKnownEntity(
    addr: string,
    oldest: { nativeTransfers: { from: string; to: string }[] }[],
  ) {
    for (const tx of oldest) {
      for (const t of tx.nativeTransfers) {
        if (t.from === addr && (await this.entities.isKnown(t.to))) return true;
      }
    }
    return false;
  }

  private async persist(
    scanId: string,
    target: string,
    result: WalletGraphResult,
  ) {
    await this.prisma.solWalletScan.update({
      where: { id: scanId },
      data: { status: 'COMPLETE', result: result as any },
    });
    for (const c of result.candidates) {
      for (const e of c.evidence) {
        await this.prisma.walletEdge.upsert({
          where: {
            chain_from_to_signal: {
              chain: 'solana',
              from: target,
              to: c.address,
              signal: e.signal,
            },
          },
          create: {
            chain: 'solana',
            from: target,
            to: c.address,
            signal: e.signal,
            weight: SIGNAL_WEIGHTS[e.signal],
            signatures: e.signatures,
            scanId,
          },
          update: { signatures: e.signatures, scanId },
        });
      }
    }
  }
}
