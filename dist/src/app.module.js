"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bullmq_1 = require("@nestjs/bullmq");
const throttler_1 = require("@nestjs/throttler");
const prisma_service_1 = require("./prisma/prisma.service");
const cache_service_1 = require("./modules/cache/cache.service");
const identity_service_1 = require("./modules/identity/identity.service");
const identity_controller_1 = require("./modules/identity/identity.controller");
const bridge_service_1 = require("./modules/bridge/bridge.service");
const bridge_controller_1 = require("./modules/bridge/bridge.controller");
const report_service_1 = require("./modules/report/report.service");
const scan_service_1 = require("./modules/scan/scan.service");
const bulk_scan_service_1 = require("./modules/scan/bulk-scan.service");
const scan_processor_1 = require("./modules/scan/scan.processor");
const scan_controller_1 = require("./modules/scan/scan.controller");
const ratelimit_module_1 = require("./modules/ratelimit/ratelimit.module");
const bridges_1 = require("./common/constants/bridges");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            throttler_1.ThrottlerModule.forRoot([{ ttl: 60000, limit: 30 }]),
            bullmq_1.BullModule.forRootAsync({
                inject: [config_1.ConfigService],
                useFactory: (config) => ({
                    connection: {
                        host: config.get('REDIS_HOST', 'localhost'),
                        port: config.get('REDIS_PORT', 6379),
                    },
                }),
            }),
            bullmq_1.BullModule.registerQueue({ name: bridges_1.SCAN_QUEUE_NAME }),
            ratelimit_module_1.RateLimitModule,
        ],
        controllers: [identity_controller_1.IdentityController, bridge_controller_1.BridgeController, scan_controller_1.ScanController],
        providers: [
            prisma_service_1.PrismaService,
            cache_service_1.CacheService,
            identity_service_1.IdentityService,
            bridge_service_1.BridgeService,
            report_service_1.ReportService,
            scan_service_1.ScanService,
            bulk_scan_service_1.BulkScanService,
            scan_processor_1.ScanProcessor,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map