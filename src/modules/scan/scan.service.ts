import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateScanDto, ScanMode } from './dto/create-scan.dto';
import { SCAN_QUEUE_NAME } from '../../common/constants/bridges';
import { ScanJobData } from './scan.processor';
import { isEnsName, resolveEns } from '../../common/utils/ens';

@Injectable()
export class ScanService {
  constructor(
    @InjectQueue(SCAN_QUEUE_NAME) private scanQueue: Queue,
    private prisma: PrismaService,
  ) {}

  async create(dto: CreateScanDto, userId?: string) {
    let resolvedAddress = dto.address.toLowerCase();
    let ensName: string | undefined;

    // If the input is an ENS name, resolve it first
    if (isEnsName(dto.address)) {
      const addr = await resolveEns(dto.address);
      if (!addr) {
        throw new BadRequestException(
          `ENS name "${dto.address}" could not be resolved to an address`,
        );
      }
      ensName = dto.address.toLowerCase();
      resolvedAddress = addr.toLowerCase();
    }

    const scan = await this.prisma.scan.create({
      data: {
        address:  resolvedAddress,
        ensName:  ensName ?? null,
        status:   'PENDING',
        userId:   userId || null,
      },
    });

    const jobData: ScanJobData = {
      scanId:  scan.id,
      address: scan.address,
      mode:    dto.mode ?? ScanMode.FULL,
    };

    await this.scanQueue.add('scan', jobData, {
      attempts:  3,
      backoff:   { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail:     50,
    });

    return { scanId: scan.id, status: 'PENDING', address: scan.address, ensName: scan.ensName ?? undefined };
  }

  async findOne(scanId: string) {
    const scan = await this.prisma.scan.findUnique({
      where: { id: scanId },

    });

    if (!scan) throw new NotFoundException(`Scan ${scanId} not found`);
    return scan;
  }

  async findByAddress(address: string) {
    return this.prisma.scan.findFirst({
      where:   { address: address.toLowerCase(), status: 'COMPLETE' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listByUser(userId: string, page = 1, limit = 20) {
    const [scans, total] = await Promise.all([
      this.prisma.scan.findMany({
        where:   { userId },
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
        select:  {
          id:        true,
          address:   true,
          status:    true,
          createdAt: true,
          pdfUrl:    true,
        },
      }),
      this.prisma.scan.count({ where: { userId } }),
    ]);

    return { scans, total, page, limit };
  }
}
