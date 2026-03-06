import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { IdentityService } from '../identity/identity.service';
import { BridgeService } from '../bridge/bridge.service';
import { CacheService } from '../cache/cache.service';
import { ScanResult } from '../../common/interfaces/wallet.interface';
import { ScanMode } from './dto/create-scan.dto';
export interface ScanJobData {
    scanId: string;
    address: string;
    mode: ScanMode;
}
export declare class ScanProcessor extends WorkerHost {
    private prisma;
    private identity;
    private bridge;
    private cache;
    private readonly logger;
    constructor(prisma: PrismaService, identity: IdentityService, bridge: BridgeService, cache: CacheService);
    process(job: Job<ScanJobData>): Promise<ScanResult>;
    private buildRisk;
    private finalize;
}
