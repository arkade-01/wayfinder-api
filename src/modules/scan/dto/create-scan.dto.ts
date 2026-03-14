import { IsOptional, IsEnum, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum ScanMode {
  QUICK  = 'quick',   // identity only
  FULL   = 'full',    // identity + bridge + exits
  BRIDGE = 'bridge',  // bridge + exits only (no identity)
}

export class CreateScanDto {
  @ApiProperty({
    example: '0x889D9950B046FAA99D5040F4FAe27e66dbC3de02',
    description: 'EVM address (0x…) or ENS name (e.g. vitalik.eth)',
  })
  @Matches(/^(0x[0-9a-fA-F]{40}|[a-zA-Z0-9][a-zA-Z0-9-]*\.eth)$/, {
    message: 'address must be a valid EVM address (0x…) or ENS name (e.g. vitalik.eth)',
  })
  address: string;

  @ApiProperty({ enum: ScanMode, default: ScanMode.FULL, required: false })
  @IsOptional()
  @IsEnum(ScanMode)
  mode?: ScanMode = ScanMode.FULL;
}
