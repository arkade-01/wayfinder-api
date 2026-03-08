"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var BulkScanService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BulkScanService = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const prisma_service_1 = require("../../prisma/prisma.service");
const bridges_1 = require("../../common/constants/bridges");
let BulkScanService = BulkScanService_1 = class BulkScanService {
    prisma;
    scanQueue;
    logger = new common_1.Logger(BulkScanService_1.name);
    constructor(prisma, scanQueue) {
        this.prisma = prisma;
        this.scanQueue = scanQueue;
    }
    async createBulkJob(addresses, mode, ip) {
        const normalizedAddresses = [...new Set(addresses.map(a => a.toLowerCase()))];
        const bulkJob = await this.prisma.bulkJob.create({
            data: {
                ip,
                addresses: normalizedAddresses,
                mode,
                total: normalizedAddresses.length,
                progress: 0,
                scanIds: [],
            },
        });
        this.logger.log(`Created bulk job ${bulkJob.id} with ${normalizedAddresses.length} addresses [${mode}]`);
        const scanIds = [];
        for (const address of normalizedAddresses) {
            const scan = await this.prisma.scan.create({
                data: { address, status: 'PENDING' },
            });
            scanIds.push(scan.id);
            await this.scanQueue.add('scan', {
                scanId: scan.id,
                address,
                mode,
                bulkJobId: bulkJob.id,
            });
        }
        await this.prisma.bulkJob.update({
            where: { id: bulkJob.id },
            data: { scanIds, status: 'RUNNING' },
        });
        return {
            jobId: bulkJob.id,
            total: normalizedAddresses.length,
            mode,
            status: 'RUNNING',
        };
    }
    async getJobStatus(jobId) {
        const bulkJob = await this.prisma.bulkJob.findUnique({
            where: { id: jobId },
        });
        if (!bulkJob) {
            return null;
        }
        const scans = await this.prisma.scan.findMany({
            where: { id: { in: bulkJob.scanIds } },
            select: { id: true, address: true, status: true, result: true, error: true },
        });
        const completed = scans.filter(s => s.status === 'COMPLETE').length;
        const failed = scans.filter(s => s.status === 'FAILED').length;
        const pending = scans.filter(s => s.status === 'PENDING' || s.status === 'RUNNING').length;
        const progress = Math.round((completed / bulkJob.total) * 100);
        let status = bulkJob.status;
        if (pending === 0 && bulkJob.status === 'RUNNING') {
            status = failed === bulkJob.total ? 'FAILED' : 'COMPLETE';
            await this.prisma.bulkJob.update({
                where: { id: jobId },
                data: { status, progress: 100 },
            });
        }
        else if (bulkJob.status === 'RUNNING') {
            await this.prisma.bulkJob.update({
                where: { id: jobId },
                data: { progress },
            });
        }
        return {
            jobId: bulkJob.id,
            status,
            progress,
            total: bulkJob.total,
            completed,
            failed,
            pending,
            mode: bulkJob.mode,
            scans: scans.map(s => ({
                id: s.id,
                address: s.address,
                status: s.status,
                result: s.result,
                error: s.error,
            })),
            createdAt: bulkJob.createdAt,
        };
    }
};
exports.BulkScanService = BulkScanService;
exports.BulkScanService = BulkScanService = BulkScanService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, bullmq_1.InjectQueue)(bridges_1.SCAN_QUEUE_NAME)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        bullmq_2.Queue])
], BulkScanService);
//# sourceMappingURL=bulk-scan.service.js.map