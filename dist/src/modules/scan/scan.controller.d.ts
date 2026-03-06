import type { Response, Request } from 'express';
import { ScanService } from './scan.service';
import { ReportService } from '../report/report.service';
import { RateLimitService } from '../ratelimit/ratelimit.service';
import { CreateScanDto } from './dto/create-scan.dto';
export declare class ScanController {
    private readonly scanService;
    private readonly reportService;
    private readonly rateLimitService;
    constructor(scanService: ScanService, reportService: ReportService, rateLimitService: RateLimitService);
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
    private getClientIp;
}
