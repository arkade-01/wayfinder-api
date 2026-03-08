import {
  Controller, Post, Get, Param, Body, Req,
  HttpCode, HttpStatus, Query, Res,
  NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiProduces } from '@nestjs/swagger';
import type { Response, Request } from 'express';
import { ScanService } from './scan.service';
import { BulkScanService } from './bulk-scan.service';
import { ReportService } from '../report/report.service';
import { RateLimitService } from '../ratelimit/ratelimit.service';
import { CreateScanDto, ScanMode } from './dto/create-scan.dto';
import { BulkScanDto } from './dto/bulk-scan.dto';
import { ScanResult } from '../../common/interfaces/wallet.interface';

@ApiTags('scans')
@Controller('scan')
export class ScanController {
  constructor(
    private readonly scanService: ScanService,
    private readonly bulkScanService: BulkScanService,
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

  // ── Bulk Scan Endpoints ──────────────────────────────────────────────────

  @Post('bulk')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Submit multiple wallets for scanning' })
  @ApiResponse({ status: 202, description: 'Bulk job created, returns jobId' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async createBulk(@Body() dto: BulkScanDto, @Req() req: Request) {
    const ip = this.getClientIp(req);
    
    // Validate addresses
    const ethAddressRe = /^0x[0-9a-fA-F]{40}$/;
    const invalidAddresses = dto.addresses.filter(a => !ethAddressRe.test(a));
    if (invalidAddresses.length > 0) {
      throw new BadRequestException({
        error: 'Invalid addresses',
        invalid: invalidAddresses.slice(0, 5),
        message: `${invalidAddresses.length} invalid address(es) found`,
      });
    }

    // Check rate limit based on mode and number of addresses
    const scanType = dto.mode === ScanMode.BRIDGE ? 'bridge' : (dto.mode === ScanMode.QUICK ? 'quick' : 'full');
    const { allowed, remaining, limit } = await this.rateLimitService.checkLimit(ip, scanType);
    
    if (remaining < dto.addresses.length) {
      throw new ForbiddenException({
        error: 'Rate limit exceeded',
        message: `You have ${remaining} ${scanType} scan(s) remaining. Requested ${dto.addresses.length}.`,
        scanType,
        limit,
        remaining,
        requested: dto.addresses.length,
      });
    }

    // Increment usage for all addresses
    for (let i = 0; i < dto.addresses.length; i++) {
      await this.rateLimitService.increment(ip, scanType);
    }

    // Create bulk job
    const result = await this.bulkScanService.createBulkJob(
      dto.addresses,
      dto.mode || ScanMode.QUICK,
      ip,
    );

    return {
      ...result,
      rateLimit: {
        type: scanType,
        remaining: remaining - dto.addresses.length,
        limit,
      },
    };
  }

  @Get('bulk/:jobId')
  @ApiOperation({ summary: 'Get bulk scan job status and results' })
  async getBulkJob(@Param('jobId') jobId: string) {
    const job = await this.bulkScanService.getJobStatus(jobId);
    if (!job) {
      throw new NotFoundException(`Bulk job ${jobId} not found`);
    }
    return job;
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
