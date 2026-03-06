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
exports.BridgeController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const bridge_service_1 = require("./bridge.service");
const ratelimit_service_1 = require("../ratelimit/ratelimit.service");
const bridges_1 = require("../../common/constants/bridges");
const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
let BridgeController = class BridgeController {
    bridgeService;
    rateLimitService;
    constructor(bridgeService, rateLimitService) {
        this.bridgeService = bridgeService;
        this.rateLimitService = rateLimitService;
    }
    async trace(address, req, exitsParam) {
        if (!ETH_ADDRESS_RE.test(address)) {
            throw new common_1.BadRequestException(`Invalid EVM address: ${address}`);
        }
        const ip = this.getClientIp(req);
        const { allowed, remaining, limit } = await this.rateLimitService.checkLimit(ip, 'bridge');
        if (!allowed) {
            throw new common_1.ForbiddenException({
                error: 'Rate limit exceeded',
                message: `You have reached your daily limit of ${limit} bridge trace(s). Resets at midnight UTC.`,
                scanType: 'bridge',
                limit,
                remaining: 0,
            });
        }
        await this.rateLimitService.increment(ip, 'bridge');
        const addr = address.toLowerCase();
        const traceExits = exitsParam !== 'false';
        const bridges = await this.bridgeService.trace(addr);
        let exits = [];
        if (traceExits) {
            const crossWalletTxs = bridges.transfers.filter((t) => t.crossWallet);
            exits = await this.bridgeService.traceExits(crossWalletTxs, bridges_1.EXIT_TRACE_DEPTH);
        }
        return {
            address: addr,
            bridges,
            exits,
            tracedAt: new Date().toISOString(),
            rateLimit: {
                type: 'bridge',
                remaining: remaining - 1,
                limit,
            },
        };
    }
    getClientIp(req) {
        const forwarded = req.headers['x-forwarded-for'];
        if (forwarded) {
            const ips = (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',');
            return ips[0].trim();
        }
        return req.ip || req.socket?.remoteAddress || 'unknown';
    }
};
exports.BridgeController = BridgeController;
__decorate([
    (0, common_1.Get)(':address'),
    (0, swagger_1.ApiOperation)({ summary: 'Trace bridge transfers and exit wallets for an address' }),
    (0, swagger_1.ApiParam)({ name: 'address', description: 'EVM wallet address (0x…)' }),
    (0, swagger_1.ApiQuery)({ name: 'exits', required: false, type: Boolean, description: 'Trace exit wallets (default: true)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Bridge transfers and exit wallets' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid address format' }),
    (0, swagger_1.ApiResponse)({ status: 429, description: 'Rate limit exceeded' }),
    __param(0, (0, common_1.Param)('address')),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Query)('exits')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", Promise)
], BridgeController.prototype, "trace", null);
exports.BridgeController = BridgeController = __decorate([
    (0, swagger_1.ApiTags)('bridge'),
    (0, common_1.Controller)('bridge'),
    __metadata("design:paramtypes", [bridge_service_1.BridgeService,
        ratelimit_service_1.RateLimitService])
], BridgeController);
//# sourceMappingURL=bridge.controller.js.map