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
exports.ScanController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const scan_service_1 = require("./scan.service");
const report_service_1 = require("../report/report.service");
const ratelimit_service_1 = require("../ratelimit/ratelimit.service");
const create_scan_dto_1 = require("./dto/create-scan.dto");
let ScanController = class ScanController {
    scanService;
    reportService;
    rateLimitService;
    constructor(scanService, reportService, rateLimitService) {
        this.scanService = scanService;
        this.reportService = reportService;
        this.rateLimitService = rateLimitService;
    }
    async create(dto, req) {
        const ip = this.getClientIp(req);
        const scanType = dto.mode === create_scan_dto_1.ScanMode.BRIDGE ? 'bridge' : (dto.mode === create_scan_dto_1.ScanMode.QUICK ? 'quick' : 'full');
        const { allowed, remaining, limit } = await this.rateLimitService.checkLimit(ip, scanType);
        if (!allowed) {
            throw new common_1.ForbiddenException({
                error: 'Rate limit exceeded',
                message: `You have reached your daily limit of ${limit} ${scanType} scan(s). Resets at midnight UTC.`,
                scanType,
                limit,
                remaining: 0,
            });
        }
        await this.rateLimitService.increment(ip, scanType);
        const result = await this.scanService.create(dto);
        return {
            ...result,
            rateLimit: {
                type: scanType,
                remaining: remaining - 1,
                limit,
            },
        };
    }
    async findOne(id) {
        return this.scanService.findOne(id);
    }
    async getReport(id, res) {
        const scan = await this.scanService.findOne(id);
        if (scan.status !== 'COMPLETE') {
            throw new common_1.BadRequestException(`Scan is ${scan.status} — PDF only available for completed scans`);
        }
        if (!scan.result) {
            throw new common_1.NotFoundException('Scan result data not found');
        }
        const result = scan.result;
        const pdf = await this.reportService.generatePdf(result);
        const filename = `wayfinder-${scan.address.slice(0, 8)}-${id.slice(0, 8)}.pdf`;
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': pdf.length,
        });
        res.end(pdf);
    }
    async findByAddress(address) {
        return this.scanService.findByAddress(address);
    }
    getClientIp(req) {
        const forwarded = req.headers['x-forwarded-for'];
        if (forwarded) {
            const ips = (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',');
            return ips[0].trim();
        }
        return req.ip || req.socket.remoteAddress || 'unknown';
    }
};
exports.ScanController = ScanController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.ACCEPTED),
    (0, swagger_1.ApiOperation)({ summary: 'Submit a wallet for scanning' }),
    (0, swagger_1.ApiResponse)({ status: 202, description: 'Scan queued, returns scanId' }),
    (0, swagger_1.ApiResponse)({ status: 429, description: 'Rate limit exceeded' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_scan_dto_1.CreateScanDto, Object]),
    __metadata("design:returntype", Promise)
], ScanController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get scan results by scanId' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ScanController.prototype, "findOne", null);
__decorate([
    (0, common_1.Get)(':id/report'),
    (0, swagger_1.ApiOperation)({ summary: 'Download scan result as PDF' }),
    (0, swagger_1.ApiProduces)('application/pdf'),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'PDF report for the scan' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ScanController.prototype, "getReport", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Look up latest scan by wallet address' }),
    __param(0, (0, common_1.Query)('address')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ScanController.prototype, "findByAddress", null);
exports.ScanController = ScanController = __decorate([
    (0, swagger_1.ApiTags)('scans'),
    (0, common_1.Controller)('scan'),
    __metadata("design:paramtypes", [scan_service_1.ScanService,
        report_service_1.ReportService,
        ratelimit_service_1.RateLimitService])
], ScanController);
//# sourceMappingURL=scan.controller.js.map