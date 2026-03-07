import {
  Controller, Post, Get, Param, Body, Req,
  HttpCode, HttpStatus, Query, Res,
  NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiProduces } from '@nestjs/swagger';
import type { Response, Request } from 'express';
import { ScanService } from './scan.service';
import { ReportService } from '../report/report.service';
import { RateLimitService } from '../ratelimit/ratelimit.service';
import { CreateScanDto, ScanMode } from './dto/create-scan.dto';
import { ScanResult } from '../../common/interfaces/wallet.interface';

@ApiTags('scans')
@Controller('scan')
export class ScanController {
  constructor(
    private readonly scanService: ScanService,
    private readonly reportService: ReportService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Submit a wallet for scanning' })
  @ApiResponse({ status: 202, description: 'Scan queued, returns scanId' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async create(@Body() dto: CreateScanDto, @Req() req: Request) {
    const ip = this.getClientIp(req);
    const scanType = dto.mode === ScanMode.BRIDGE ? 'bridge' : (dto.mode === ScanMode.QUICK ? 'quick' : 'full');
    
    // Check rate limit
    const { allowed, remaining, limit } = await this.rateLimitService.checkLimit(ip, scanType);
    
    if (!allowed) {
      throw new ForbiddenException({
        error: 'Rate limit exceeded',
        message: `You have reached your daily limit of ${limit} ${scanType} scan(s). Resets at midnight UTC.`,
        scanType,
        limit,
        remaining: 0,
      });
    }
    
    // Increment usage
    await this.rateLimitService.increment(ip, scanType);
    
    // Create scan
    const result = await this.scanService.create(dto);
    
    return {
      ...result,
      rateLimit: {
        type: scanType,
        remaining: remaining - 1,
        limit,
      },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get scan results by scanId' })
  async findOne(@Param('id') id: string) {
    return this.scanService.findOne(id);
  }

  @Get(':id/report')
  @ApiOperation({ summary: 'Download scan result as PDF' })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 200, description: 'PDF report for the scan' })
  async getReport(@Param('id') id: string, @Res() res: Response) {
    const scan = await this.scanService.findOne(id);

    if (scan.status !== 'COMPLETE') {
      throw new BadRequestException(`Scan is ${scan.status} — PDF only available for completed scans`);
    }

    if (!scan.result) {
      throw new NotFoundException('Scan result data not found');
    }

    const result = scan.result as unknown as ScanResult;
    const pdf = await this.reportService.generatePdf(result);

    const filename = `wayfinder-${scan.address.slice(0, 8)}-${id.slice(0, 8)}.pdf`;

    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':      pdf.length,
    });

    res.end(pdf);
  }

  @Get()
  @ApiOperation({ summary: 'Look up latest scan by wallet address' })
  async findByAddress(@Query('address') address: string) {
    return this.scanService.findByAddress(address);
  }

  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',');
      return ips[0].trim();
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
  }
}
