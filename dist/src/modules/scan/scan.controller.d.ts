import type { Response, Request } from 'express';
import { ScanService } from './scan.service';
import { BulkScanService } from './bulk-scan.service';
import { ReportService } from '../report/report.service';
import { RateLimitService } from '../ratelimit/ratelimit.service';
import { CreateScanDto, ScanMode } from './dto/create-scan.dto';
import { BulkScanDto } from './dto/bulk-scan.dto';
export declare class ScanController {
    private readonly scanService;
    private readonly bulkScanService;
    private readonly reportService;
    private readonly rateLimitService;
    constructor(scanService: ScanService, bulkScanService: BulkScanService, reportService: ReportService, rateLimitService: RateLimitService);
    create(dto: CreateScanDto, req: Request): Promise<{
        rateLimit: {
            type: string;
            remaining: number;
            limit: number;
        };
        scanId: string;
        status: string;
    }>;
    findOne(id: string): Promise<{
        error: string | null;
        id: string;
        address: string;
        result: import("@prisma/client/runtime/library").JsonValue | null;
        userId: string | null;
        status: import(".prisma/client").$Enums.ScanStatus;
        pdfUrl: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    getReport(id: string, res: Response): Promise<void>;
    findByAddress(address: string): Promise<{
        error: string | null;
        id: string;
        address: string;
        result: import("@prisma/client/runtime/library").JsonValue | null;
        userId: string | null;
        status: import(".prisma/client").$Enums.ScanStatus;
        pdfUrl: string | null;
        createdAt: Date;
        updatedAt: Date;
    } | null>;
    createBulk(dto: BulkScanDto, req: Request): Promise<{
        rateLimit: {
            type: string;
            remaining: number;
            limit: number;
        };
        jobId: string;
        total: number;
        mode: ScanMode;
        status: string;
    }>;
    getBulkJob(jobId: string): Promise<{
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
    }>;
    private getClientIp;
}
