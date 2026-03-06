import { Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

export interface ScanLimits {
  quick: { used: number; limit: number; resetsAt: string };
  full: { used: number; limit: number; resetsAt: string };
  bridge: { used: number; limit: number; resetsAt: string };
}

const LIMITS = {
  quick: 3,   // Basic identity scan
  full: 1,    // Deep scan
  bridge: 1,  // Bridge trace
};

const TTL_SECONDS = 24 * 60 * 60; // 24 hours

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private redis: Redis;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: 3,
    });
  }

  private getKey(ip: string, scanType: string): string {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return `ratelimit:${ip}:${scanType}:${today}`;
  }

  private getResetTime(): string {
    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);
    return tomorrow.toISOString();
  }

  async checkLimit(ip: string, scanType: 'quick' | 'full' | 'bridge'): Promise<{ allowed: boolean; remaining: number; limit: number }> {
    const key = this.getKey(ip, scanType);
    const limit = LIMITS[scanType];
    
    const used = parseInt(await this.redis.get(key) || '0');
    const remaining = Math.max(0, limit - used);
    
    return {
      allowed: used < limit,
      remaining,
      limit,
    };
  }

  async increment(ip: string, scanType: 'quick' | 'full' | 'bridge'): Promise<void> {
    const key = this.getKey(ip, scanType);
    
    const exists = await this.redis.exists(key);
    await this.redis.incr(key);
    
    if (!exists) {
      await this.redis.expire(key, TTL_SECONDS);
    }
    
    this.logger.log(`Rate limit incremented for ${ip} [${scanType}]`);
  }

  async getLimits(ip: string): Promise<ScanLimits> {
    const resetsAt = this.getResetTime();
    
    const [quickUsed, fullUsed, bridgeUsed] = await Promise.all([
      this.redis.get(this.getKey(ip, 'quick')),
      this.redis.get(this.getKey(ip, 'full')),
      this.redis.get(this.getKey(ip, 'bridge')),
    ]);

    return {
      quick: {
        used: parseInt(quickUsed || '0'),
        limit: LIMITS.quick,
        resetsAt,
      },
      full: {
        used: parseInt(fullUsed || '0'),
        limit: LIMITS.full,
        resetsAt,
      },
      bridge: {
        used: parseInt(bridgeUsed || '0'),
        limit: LIMITS.bridge,
        resetsAt,
      },
    };
  }
}
