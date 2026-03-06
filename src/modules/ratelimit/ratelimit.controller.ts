import { Controller, Get, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { RateLimitService } from './ratelimit.service';

@ApiTags('ratelimit')
@Controller('limits')
export class RateLimitController {
  constructor(private readonly rateLimitService: RateLimitService) {}

  @Get()
  @ApiOperation({ summary: 'Get current rate limits for this IP' })
  async getLimits(@Req() req: any) {
    const ip = this.getClientIp(req);
    const limits = await this.rateLimitService.getLimits(ip);
    
    return {
      ip: this.maskIp(ip),
      limits,
    };
  }

  private getClientIp(req: any): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',');
      return ips[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || 'unknown';
  }

  private maskIp(ip: string): string {
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.xxx.xxx`;
    }
    return ip.slice(0, 8) + '...';
  }
}
