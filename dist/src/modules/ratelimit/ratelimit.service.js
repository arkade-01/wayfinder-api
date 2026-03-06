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
var RateLimitService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitService = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = require("ioredis");
const LIMITS = {
    quick: 3,
    full: 1,
    bridge: 1,
};
const TTL_SECONDS = 24 * 60 * 60;
let RateLimitService = RateLimitService_1 = class RateLimitService {
    logger = new common_1.Logger(RateLimitService_1.name);
    redis;
    constructor() {
        this.redis = new ioredis_1.Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            maxRetriesPerRequest: 3,
        });
    }
    getKey(ip, scanType) {
        const today = new Date().toISOString().split('T')[0];
        return `ratelimit:${ip}:${scanType}:${today}`;
    }
    getResetTime() {
        const tomorrow = new Date();
        tomorrow.setUTCHours(24, 0, 0, 0);
        return tomorrow.toISOString();
    }
    async checkLimit(ip, scanType) {
        const key = this.getKey(ip, scanType);
        const limit = LIMITS[scanType];
        const used = parseInt(await this.redis.get(key) || '0');
        const remaining = Math.max(0, limit - used);
        return {
            allowed: used < limit,
            remaining,
            limit,
        };
    }
    async increment(ip, scanType) {
        const key = this.getKey(ip, scanType);
        const exists = await this.redis.exists(key);
        await this.redis.incr(key);
        if (!exists) {
            await this.redis.expire(key, TTL_SECONDS);
        }
        this.logger.log(`Rate limit incremented for ${ip} [${scanType}]`);
    }
    async getLimits(ip) {
        const resetsAt = this.getResetTime();
        const [quickUsed, fullUsed, bridgeUsed] = await Promise.all([
            this.redis.get(this.getKey(ip, 'quick')),
            this.redis.get(this.getKey(ip, 'full')),
            this.redis.get(this.getKey(ip, 'bridge')),
        ]);
        return {
            quick: {
                used: parseInt(quickUsed || '0'),
                limit: LIMITS.quick,
                resetsAt,
            },
            full: {
                used: parseInt(fullUsed || '0'),
                limit: LIMITS.full,
                resetsAt,
            },
            bridge: {
                used: parseInt(bridgeUsed || '0'),
                limit: LIMITS.bridge,
                resetsAt,
            },
        };
    }
};
exports.RateLimitService = RateLimitService;
exports.RateLimitService = RateLimitService = RateLimitService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], RateLimitService);
//# sourceMappingURL=ratelimit.service.js.map