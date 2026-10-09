import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { OgService } from './og.service';
import { RateLimitService } from '../../ratelimit/ratelimit.service';
import { getClientIp } from '../../../common/utils/client-ip';

@ApiTags('solana')
@Controller('solana/og')
export class OgController {
  constructor(
    private readonly og: OgService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Get('search')
  @ApiOperation({
    summary:
      'Find the original (oldest) Solana mint for a token name or ticker',
  })
  @ApiQuery({
    name: 'q',
    description: 'Token name or ticker, e.g. "bonk" or "$WIF"',
  })
  @ApiQuery({
    name: 'minLiquidity',
    required: false,
    description: 'Min USD liquidity (default 1000)',
  })
  async search(
    @Query('q') q: string,
    @Query('minLiquidity') minLiquidity: string,
    @Req() req: Request,
  ) {
    if (!q || q.trim().length < 2 || q.length > 40)
      throw new BadRequestException('q must be 2–40 characters');

    const ip = getClientIp(req);
    const { allowed, limit } = await this.rateLimit.checkLimit(ip, 'og');
    if (!allowed)
      throw new ForbiddenException({
        error: 'Rate limit exceeded',
        message: `Daily limit of ${limit} OG searches reached.`,
      });
    await this.rateLimit.increment(ip, 'og');

    const min = Number(minLiquidity ?? 1000);
    return this.og.search(q, {
      minLiquidityUsd: Number.isFinite(min) && min >= 0 ? min : 1000,
    });
  }
}
