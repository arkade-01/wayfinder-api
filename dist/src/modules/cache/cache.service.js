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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const bridges_1 = require("../../common/constants/bridges");
let CacheService = class CacheService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async get(address, mode) {
        const key = mode ? `${address.toLowerCase()}:${mode}` : address.toLowerCase();
        const cached = await this.prisma.walletCache.findUnique({
            where: { address: key },
        });
        if (!cached)
            return null;
        if (new Date() > cached.expiresAt)
            return null;
        return cached.data;
    }
    async set(address, data, mode) {
        const key = mode ? `${address.toLowerCase()}:${mode}` : address.toLowerCase();
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + bridges_1.CACHE_TTL_HOURS);
        await this.prisma.walletCache.upsert({
            where: { address: key },
            create: { address: key, data: data, expiresAt },
            update: { data: data, cachedAt: new Date(), expiresAt },
        });
    }
    async invalidate(address, mode) {
        const key = mode ? `${address.toLowerCase()}:${mode}` : address.toLowerCase();
        await this.prisma.walletCache.deleteMany({
            where: { address: key },
        });
    }
};
exports.CacheService = CacheService;
exports.CacheService = CacheService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CacheService);
//# sourceMappingURL=cache.service.js.map