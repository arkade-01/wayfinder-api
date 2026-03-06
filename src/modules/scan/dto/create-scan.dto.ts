import { IsEthereumAddress, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum ScanMode {
  QUICK  = 'quick',   // identity only
  FULL   = 'full',    // identity + bridge + exits
}

export class CreateScanDto {
  @ApiProperty({ example: '0x889D9950B046FAA99D5040F4FAe27e66dbC3de02' })
  @IsEthereumAddress()
  address: string;

  @ApiProperty({ enum: ScanMode, default: ScanMode.FULL, required: false })
  @IsOptional()
  @IsEnum(ScanMode)
  mode?: ScanMode = ScanMode.FULL;
}
