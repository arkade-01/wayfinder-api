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
exports.BulkScanDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const create_scan_dto_1 = require("./create-scan.dto");
const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
class BulkScanDto {
    addresses;
    mode = create_scan_dto_1.ScanMode.QUICK;
}
exports.BulkScanDto = BulkScanDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: ['0x889D9950B046FAA99D5040F4FAe27e66dbC3de02', '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'],
        description: 'Array of wallet addresses (max 50)'
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayMaxSize)(50),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], BulkScanDto.prototype, "addresses", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: create_scan_dto_1.ScanMode, default: create_scan_dto_1.ScanMode.QUICK, required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(create_scan_dto_1.ScanMode),
    __metadata("design:type", String)
], BulkScanDto.prototype, "mode", void 0);
//# sourceMappingURL=bulk-scan.dto.js.map