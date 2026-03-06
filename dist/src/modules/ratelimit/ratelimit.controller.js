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
exports.RateLimitController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const ratelimit_service_1 = require("./ratelimit.service");
let RateLimitController = class RateLimitController {
    rateLimitService;
    constructor(rateLimitService) {
        this.rateLimitService = rateLimitService;
    }
    async getLimits(req) {
        const ip = this.getClientIp(req);
        const limits = await this.rateLimitService.getLimits(ip);
        return {
            ip: this.maskIp(ip),
            limits,
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
    maskIp(ip) {
        const parts = ip.split('.');
        if (parts.length === 4) {
            return `${parts[0]}.${parts[1]}.xxx.xxx`;
        }
        return ip.slice(0, 8) + '...';
    }
};
exports.RateLimitController = RateLimitController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get current rate limits for this IP' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RateLimitController.prototype, "getLimits", null);
exports.RateLimitController = RateLimitController = __decorate([
    (0, swagger_1.ApiTags)('ratelimit'),
    (0, common_1.Controller)('limits'),
    __metadata("design:paramtypes", [ratelimit_service_1.RateLimitService])
], RateLimitController);
//# sourceMappingURL=ratelimit.controller.js.map