import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CACHE_TTL_HOURS } from '../../common/constants/bridges';

@Injectable()
export class CacheService {
  constructor(private prisma: PrismaService) {}

  async get(address: string): Promise<object | null> {
    const cached = await this.prisma.walletCache.findUnique({
      where: { address: address.toLowerCase() },
    });
    if (!cached) return null;
    if (new Date() > cached.expiresAt) return null; // expired
    return cached.data as object;
  }

  async set(address: string, data: object): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + CACHE_TTL_HOURS);

    await this.prisma.walletCache.upsert({
      where:  { address: address.toLowerCase() },
      create: { address: address.toLowerCase(), data: data as any, expiresAt },
      update: { data: data as any, cachedAt: new Date(), expiresAt },
    });
  }

  async invalidate(address: string): Promise<void> {
    await this.prisma.walletCache.deleteMany({
      where: { address: address.toLowerCase() },
    });
  }
}
