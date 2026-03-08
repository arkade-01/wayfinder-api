import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { ScanMode } from './dto/create-scan.dto';
export declare class BulkScanService {
    private prisma;
    private scanQueue;
    private readonly logger;
    constructor(prisma: PrismaService, scanQueue: Queue);
    createBulkJob(addresses: string[], mode: ScanMode, ip: string): Promise<{
        jobId: string;
        total: number;
        mode: ScanMode;
        status: string;
    }>;
    getJobStatus(jobId: string): Promise<{
        jobId: string;
        status: import(".prisma/client").$Enums.BulkJobStatus;
        progress: number;
        total: number;
        completed: number;
        failed: number;
        pending: number;
        mode: string;
        scans: {
            id: string;
            address: string;
            status: import(".prisma/client").$Enums.ScanStatus;
            result: import("@prisma/client/runtime/library").JsonValue;
            error: string | null;
        }[];
        createdAt: Date;
    } | null>;
}
