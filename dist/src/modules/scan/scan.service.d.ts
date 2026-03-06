import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateScanDto } from './dto/create-scan.dto';
export declare class ScanService {
    private scanQueue;
    private prisma;
    constructor(scanQueue: Queue, prisma: PrismaService);
    create(dto: CreateScanDto, userId?: string): Promise<{
        scanId: string;
        status: string;
    }>;
    findOne(scanId: string): Promise<{
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
    listByUser(userId: string, page?: number, limit?: number): Promise<{
        scans: {
            id: string;
            address: string;
            status: import(".prisma/client").$Enums.ScanStatus;
            pdfUrl: string | null;
            createdAt: Date;
        }[];
        total: number;
        page: number;
        limit: number;
    }>;
}
