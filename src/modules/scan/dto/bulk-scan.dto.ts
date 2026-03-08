import { IsArray, IsEnum, IsOptional, IsString, ArrayMaxSize, ArrayMinSize, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ScanMode } from './create-scan.dto';

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export class BulkScanDto {
  @ApiProperty({ 
    example: ['0x889D9950B046FAA99D5040F4FAe27e66dbC3de02', '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'],
    description: 'Array of wallet addresses (max 50)'
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  addresses: string[];

  @ApiProperty({ enum: ScanMode, default: ScanMode.QUICK, required: false })
  @IsOptional()
  @IsEnum(ScanMode)
  mode?: ScanMode = ScanMode.QUICK;
}
