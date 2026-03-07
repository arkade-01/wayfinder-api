import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { IdentityService } from '../identity/identity.service';
import { BridgeService } from '../bridge/bridge.service';
import { CacheService } from '../cache/cache.service';
import { SCAN_QUEUE_NAME, EXIT_TRACE_DEPTH, PHISHING_PATTERNS } from '../../common/constants/bridges';
import { ScanResult, ExitWalletResult, RiskFlags } from '../../common/interfaces/wallet.interface';
import { ScanMode } from './dto/create-scan.dto';

export interface ScanJobData {
  scanId: string;
  address: string;
  mode: ScanMode;
}

@Processor(SCAN_QUEUE_NAME)
export class ScanProcessor extends WorkerHost {
  private readonly logger = new Logger(ScanProcessor.name);

  constructor(
    private prisma: PrismaService,
    private identity: IdentityService,
    private bridge: BridgeService,
    private cache: CacheService,
  ) {
    super();
  }

  async process(job: Job<ScanJobData>): Promise<ScanResult> {
    const { scanId, address, mode } = job.data;
    this.logger.log(`Processing scan ${scanId} for ${address} [${mode}]`);

    await this.prisma.scan.update({
      where: { id: scanId },
      data: { status: 'RUNNING' },
    });

    try {
      // ── Step 1: Cache Check ──────────────────────────────────────────────
      // Each mode has its own cache; FULL can serve QUICK requests
      let cached: object | null = null;
      if (mode === ScanMode.FULL) {
        cached = await this.cache.get(address, 'full');
      } else if (mode === ScanMode.BRIDGE) {
        cached = await this.cache.get(address, 'bridge') || await this.cache.get(address, 'full');
      } else {
        cached = await this.cache.get(address, 'full') || await this.cache.get(address, 'quick');
      }
      if (cached) {
        this.logger.log(`Cache hit for ${address} [${mode}]`);
        await this.prisma.scan.update({
          where: { id: scanId },
          data: { status: 'COMPLETE', result: cached },
        });
        return cached as ScanResult;
      }

      // ── BRIDGE mode: skip identity, just do bridge + exits ───────────────
      if (mode === ScanMode.BRIDGE) {
        await job.updateProgress(20);
        const bridgeResult = await this.bridge.trace(address);

        await job.updateProgress(50);
        const crossWalletExits = bridgeResult.transfers.filter((t) => t.crossWallet);

        await job.updateProgress(70);
        const exits: ExitWalletResult[] = await this.bridge.traceExits(
          crossWalletExits,
          EXIT_TRACE_DEPTH,
        );

        await job.updateProgress(90);
        const result: ScanResult = {
          scanId,
          address,
          identity: { ens: null, twitter: null, lens: null, farcaster: null, xResults: [], web: [] },
          onchain:  { txCount: 0, balanceEth: 0, balanceUsd: 0, lastActive: '', tokens: [], nfts: [], topContacts: [] },
          bridges:  bridgeResult,
          exits,
          risk:     this.buildRisk(exits, null),
          cachedAt: new Date().toISOString(),
        };

        await this.finalize(scanId, address, result, mode);
        await job.updateProgress(100);
        return result;
      }

      // ── Step 2: Parallel identity + on-chain ─────────────────────────────
      await job.updateProgress(10);
      const [identityResult, onchainResult] = await Promise.all([
        this.identity.resolve(address),
        this.identity.getOnchain(address),
      ]);

      // ── Step 3: X/Twitter + web search using ENS if found ────────────────
      await job.updateProgress(30);
      const [xResults, webResults] = await Promise.all([
        this.identity.searchX(address, identityResult.ens),
        this.identity.searchWeb(address, identityResult.ens),
      ]);

      identityResult.xResults = xResults;
      identityResult.web      = webResults;

      if (mode === ScanMode.QUICK) {
        const result: ScanResult = {
          scanId,
          address,
          identity: identityResult,
          onchain:  onchainResult,
          bridges:  { totalBridgedUsd: 0, bridgesUsed: [], destChains: [], transfers: [] },
          exits:    [],
          risk:     this.buildRisk([], identityResult.ens),
          cachedAt: new Date().toISOString(),
        };
        await this.finalize(scanId, address, result, mode);
        return result;
      }

      // ── Step 3: Bridge scan ───────────────────────────────────────────────
      await job.updateProgress(50);
      const bridgeResult = await this.bridge.trace(address);

      // ── Step 4: Exit detection ────────────────────────────────────────────
      await job.updateProgress(65);
      const crossWalletExits = bridgeResult.transfers.filter(
        (t) => t.crossWallet,
      );

      // ── Step 5: Trace exit wallets (max depth 2) ─────────────────────────
      await job.updateProgress(75);
      const exits: ExitWalletResult[] = await this.bridge.traceExits(
        crossWalletExits,
        EXIT_TRACE_DEPTH,
      );

      // ── Step 6+7: Build final result ──────────────────────────────────────
      await job.updateProgress(90);
      const result: ScanResult = {
        scanId,
        address,
        identity: identityResult,
        onchain:  onchainResult,
        bridges:  bridgeResult,
        exits,
        risk:     this.buildRisk(exits, identityResult.ens),
        cachedAt: new Date().toISOString(),
      };

      await this.finalize(scanId, address, result, mode);
      await job.updateProgress(100);
      return result;

    } catch (err) {
      this.logger.error(`Scan ${scanId} failed: ${err.message}`);
      await this.prisma.scan.update({
        where: { id: scanId },
        data: { status: 'FAILED', error: err.message },
      });
      throw err;
    }
  }

  private buildRisk(exits: ExitWalletResult[], ens: string | null): RiskFlags {
    const crossWalletExits = exits.filter((e) => !e.isContract).length;
    const unknownExits     = exits.filter((e) => !e.identity?.ens && !e.identity?.twitter).length;
    const phishingContact  = ens
      ? PHISHING_PATTERNS.some((p) => ens.toLowerCase().includes(p))
      : false;

    return {
      crossWalletExits,
      unknownExits,
      phishingContact,
      mixerContact:    false, // TODO: Tornado cash contract list
      highValueBridge: exits.some((e) => parseFloat(e.amountUsd) > 10000),
    };
  }

  private async finalize(scanId: string, address: string, result: ScanResult, mode: ScanMode) {
    await this.cache.set(address, result, mode);
    await this.prisma.scan.update({
      where: { id: scanId },
      data: { status: 'COMPLETE', result: result as any },
    });
  }
}
