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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScanService = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const prisma_service_1 = require("../../prisma/prisma.service");
const create_scan_dto_1 = require("./dto/create-scan.dto");
const bridges_1 = require("../../common/constants/bridges");
let ScanService = class ScanService {
    scanQueue;
    prisma;
    constructor(scanQueue, prisma) {
        this.scanQueue = scanQueue;
        this.prisma = prisma;
    }
    async create(dto, userId) {
        const scan = await this.prisma.scan.create({
            data: {
                address: dto.address.toLowerCase(),
                status: 'PENDING',
                userId: userId || null,
            },
        });
        const jobData = {
            scanId: scan.id,
            address: scan.address,
            mode: dto.mode ?? create_scan_dto_1.ScanMode.FULL,
        };
        await this.scanQueue.add('scan', jobData, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: 100,
            removeOnFail: 50,
        });
        return { scanId: scan.id, status: 'PENDING' };
    }
    async findOne(scanId) {
        const scan = await this.prisma.scan.findUnique({
            where: { id: scanId },
        });
        if (!scan)
            throw new common_1.NotFoundException(`Scan ${scanId} not found`);
        return scan;
    }
    async findByAddress(address) {
        return this.prisma.scan.findFirst({
            where: { address: address.toLowerCase(), status: 'COMPLETE' },
            orderBy: { createdAt: 'desc' },
        });
    }
    async listByUser(userId, page = 1, limit = 20) {
        const [scans, total] = await Promise.all([
            this.prisma.scan.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                select: {
                    id: true,
                    address: true,
                    status: true,
                    createdAt: true,
                    pdfUrl: true,
                },
            }),
            this.prisma.scan.count({ where: { userId } }),
        ]);
        return { scans, total, page, limit };
    }
};
exports.ScanService = ScanService;
exports.ScanService = ScanService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, bullmq_1.InjectQueue)(bridges_1.SCAN_QUEUE_NAME)),
    __metadata("design:paramtypes", [bullmq_2.Queue,
        prisma_service_1.PrismaService])
], ScanService);
//# sourceMappingURL=scan.service.js.map