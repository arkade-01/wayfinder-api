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
exports.IdentityController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const identity_service_1 = require("./identity.service");
const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
let IdentityController = class IdentityController {
    identityService;
    constructor(identityService) {
        this.identityService = identityService;
    }
    async resolve(address) {
        if (!ETH_ADDRESS_RE.test(address)) {
            throw new common_1.BadRequestException(`Invalid EVM address: ${address}`);
        }
        const addr = address.toLowerCase();
        const [identity, onchain] = await Promise.all([
            this.identityService.resolve(addr),
            this.identityService.getOnchain(addr),
        ]);
        const [xResults, webResults] = await Promise.all([
            this.identityService.searchX(addr, identity.ens),
            this.identityService.searchWeb(addr, identity.ens),
        ]);
        identity.xResults = xResults;
        identity.web = webResults;
        return {
            address: addr,
            identity,
            onchain,
            resolvedAt: new Date().toISOString(),
        };
    }
};
exports.IdentityController = IdentityController;
__decorate([
    (0, common_1.Get)(':address'),
    (0, swagger_1.ApiOperation)({ summary: 'Resolve identity for a wallet address' }),
    (0, swagger_1.ApiParam)({ name: 'address', description: 'EVM wallet address (0x…)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Identity and on-chain summary' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid address format' }),
    __param(0, (0, common_1.Param)('address')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], IdentityController.prototype, "resolve", null);
exports.IdentityController = IdentityController = __decorate([
    (0, swagger_1.ApiTags)('identity'),
    (0, common_1.Controller)('identity'),
    __metadata("design:paramtypes", [identity_service_1.IdentityService])
], IdentityController);
//# sourceMappingURL=identity.controller.js.map