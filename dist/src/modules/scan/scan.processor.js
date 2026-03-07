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
var ScanProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScanProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const identity_service_1 = require("../identity/identity.service");
const bridge_service_1 = require("../bridge/bridge.service");
const cache_service_1 = require("../cache/cache.service");
const bridges_1 = require("../../common/constants/bridges");
const create_scan_dto_1 = require("./dto/create-scan.dto");
let ScanProcessor = ScanProcessor_1 = class ScanProcessor extends bullmq_1.WorkerHost {
    prisma;
    identity;
    bridge;
    cache;
    logger = new common_1.Logger(ScanProcessor_1.name);
    constructor(prisma, identity, bridge, cache) {
        super();
        this.prisma = prisma;
        this.identity = identity;
        this.bridge = bridge;
        this.cache = cache;
    }
    async process(job) {
        const { scanId, address, mode } = job.data;
        this.logger.log(`Processing scan ${scanId} for ${address} [${mode}]`);
        await this.prisma.scan.update({
            where: { id: scanId },
            data: { status: 'RUNNING' },
        });
        try {
            let cached = null;
            if (mode === create_scan_dto_1.ScanMode.FULL) {
                cached = await this.cache.get(address, 'full');
            }
            else if (mode === create_scan_dto_1.ScanMode.BRIDGE) {
                cached = await this.cache.get(address, 'bridge') || await this.cache.get(address, 'full');
            }
            else {
                cached = await this.cache.get(address, 'full') || await this.cache.get(address, 'quick');
            }
            if (cached) {
                this.logger.log(`Cache hit for ${address} [${mode}]`);
                await this.prisma.scan.update({
                    where: { id: scanId },
                    data: { status: 'COMPLETE', result: cached },
                });
                return cached;
            }
            if (mode === create_scan_dto_1.ScanMode.BRIDGE) {
                await job.updateProgress(20);
                const bridgeResult = await this.bridge.trace(address);
                await job.updateProgress(50);
                const crossWalletExits = bridgeResult.transfers.filter((t) => t.crossWallet);
                await job.updateProgress(70);
                const exits = await this.bridge.traceExits(crossWalletExits, bridges_1.EXIT_TRACE_DEPTH);
                await job.updateProgress(90);
                const result = {
                    scanId,
                    address,
                    identity: { ens: null, twitter: null, lens: null, farcaster: null, xResults: [], web: [] },
                    onchain: { txCount: 0, balanceEth: 0, balanceUsd: 0, lastActive: '', tokens: [], nfts: [], topContacts: [] },
                    bridges: bridgeResult,
                    exits,
                    risk: this.buildRisk(exits, null),
                    cachedAt: new Date().toISOString(),
                };
                await this.finalize(scanId, address, result, mode);
                await job.updateProgress(100);
                return result;
            }
            await job.updateProgress(10);
            const [identityResult, onchainResult] = await Promise.all([
                this.identity.resolve(address),
                this.identity.getOnchain(address),
            ]);
            await job.updateProgress(30);
            const [xResults, webResults] = await Promise.all([
                this.identity.searchX(address, identityResult.ens),
                this.identity.searchWeb(address, identityResult.ens),
            ]);
            identityResult.xResults = xResults;
            identityResult.web = webResults;
            if (mode === create_scan_dto_1.ScanMode.QUICK) {
                const result = {
                    scanId,
                    address,
                    identity: identityResult,
                    onchain: onchainResult,
                    bridges: { totalBridgedUsd: 0, bridgesUsed: [], destChains: [], transfers: [] },
                    exits: [],
                    risk: this.buildRisk([], identityResult.ens),
                    cachedAt: new Date().toISOString(),
                };
                await this.finalize(scanId, address, result, mode);
                return result;
            }
            await job.updateProgress(50);
            const bridgeResult = await this.bridge.trace(address);
            await job.updateProgress(65);
            const crossWalletExits = bridgeResult.transfers.filter((t) => t.crossWallet);
            await job.updateProgress(75);
            const exits = await this.bridge.traceExits(crossWalletExits, bridges_1.EXIT_TRACE_DEPTH);
            await job.updateProgress(90);
            const result = {
                scanId,
                address,
                identity: identityResult,
                onchain: onchainResult,
                bridges: bridgeResult,
                exits,
                risk: this.buildRisk(exits, identityResult.ens),
                cachedAt: new Date().toISOString(),
            };
            await this.finalize(scanId, address, result, mode);
            await job.updateProgress(100);
            return result;
        }
        catch (err) {
            this.logger.error(`Scan ${scanId} failed: ${err.message}`);
            await this.prisma.scan.update({
                where: { id: scanId },
                data: { status: 'FAILED', error: err.message },
            });
            throw err;
        }
    }
    buildRisk(exits, ens) {
        const crossWalletExits = exits.filter((e) => !e.isContract).length;
        const unknownExits = exits.filter((e) => !e.identity?.ens && !e.identity?.twitter).length;
        const phishingContact = ens
            ? bridges_1.PHISHING_PATTERNS.some((p) => ens.toLowerCase().includes(p))
            : false;
        return {
            crossWalletExits,
            unknownExits,
            phishingContact,
            mixerContact: false,
            highValueBridge: exits.some((e) => parseFloat(e.amountUsd) > 10000),
        };
    }
    async finalize(scanId, address, result, mode) {
        await this.cache.set(address, result, mode);
        await this.prisma.scan.update({
            where: { id: scanId },
            data: { status: 'COMPLETE', result: result },
        });
    }
};
exports.ScanProcessor = ScanProcessor;
exports.ScanProcessor = ScanProcessor = ScanProcessor_1 = __decorate([
    (0, bullmq_1.Processor)(bridges_1.SCAN_QUEUE_NAME),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        identity_service_1.IdentityService,
        bridge_service_1.BridgeService,
        cache_service_1.CacheService])
], ScanProcessor);
//# sourceMappingURL=scan.processor.js.map