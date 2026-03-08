import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { SCAN_QUEUE_NAME } from '../../common/constants/bridges';
import { ScanMode } from './dto/create-scan.dto';
import { ScanJobData } from './scan.processor';

@Injectable()
export class BulkScanService {
  private readonly logger = new Logger(BulkScanService.name);

  constructor(
    private prisma: PrismaService,
    @InjectQueue(SCAN_QUEUE_NAME) private scanQueue: Queue,
  ) {}

  async createBulkJob(addresses: string[], mode: ScanMode, ip: string) {
    // Normalize addresses
    const normalizedAddresses = [...new Set(addresses.map(a => a.toLowerCase()))];
    
    // Create bulk job record
    const bulkJob = await this.prisma.bulkJob.create({
      data: {
        ip,
        addresses: normalizedAddresses,
        mode,
        total: normalizedAddresses.length,
        progress: 0,
        scanIds: [],
      },
    });

    this.logger.log(`Created bulk job ${bulkJob.id} with ${normalizedAddresses.length} addresses [${mode}]`);

    // Create individual scans and queue them
    const scanIds: string[] = [];
    
    for (const address of normalizedAddresses) {
      const scan = await this.prisma.scan.create({
        data: { address, status: 'PENDING' },
      });
      
      scanIds.push(scan.id);
      
      await this.scanQueue.add('scan', {
        scanId: scan.id,
        address,
        mode,
        bulkJobId: bulkJob.id,
      } as ScanJobData & { bulkJobId: string });
    }

    // Update bulk job with scan IDs
    await this.prisma.bulkJob.update({
      where: { id: bulkJob.id },
      data: { scanIds, status: 'RUNNING' },
    });

    return {
      jobId: bulkJob.id,
      total: normalizedAddresses.length,
      mode,
      status: 'RUNNING',
    };
  }

  async getJobStatus(jobId: string) {
    const bulkJob = await this.prisma.bulkJob.findUnique({
      where: { id: jobId },
    });

    if (!bulkJob) {
      return null;
    }

    // Get status of all scans
    const scans = await this.prisma.scan.findMany({
      where: { id: { in: bulkJob.scanIds } },
      select: { id: true, address: true, status: true, result: true, error: true },
    });

    const completed = scans.filter(s => s.status === 'COMPLETE').length;
    const failed = scans.filter(s => s.status === 'FAILED').length;
    const pending = scans.filter(s => s.status === 'PENDING' || s.status === 'RUNNING').length;

    // Update progress
    const progress = Math.round((completed / bulkJob.total) * 100);
    
    // Check if all done
    let status = bulkJob.status;
    if (pending === 0 && bulkJob.status === 'RUNNING') {
      status = failed === bulkJob.total ? 'FAILED' : 'COMPLETE';
      await this.prisma.bulkJob.update({
        where: { id: jobId },
        data: { status, progress: 100 },
      });
    } else if (bulkJob.status === 'RUNNING') {
      await this.prisma.bulkJob.update({
        where: { id: jobId },
        data: { progress },
      });
    }

    return {
      jobId: bulkJob.id,
      status,
      progress,
      total: bulkJob.total,
      completed,
      failed,
      pending,
      mode: bulkJob.mode,
      scans: scans.map(s => ({
        id: s.id,
        address: s.address,
        status: s.status,
        result: s.result,
        error: s.error,
      })),
      createdAt: bulkJob.createdAt,
    };
  }
}
