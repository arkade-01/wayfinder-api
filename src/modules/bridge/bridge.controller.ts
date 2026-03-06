import { Controller, Get, Param, Query, Req, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { BridgeService } from './bridge.service';
import { RateLimitService } from '../ratelimit/ratelimit.service';
import { ExitWalletResult } from '../../common/interfaces/wallet.interface';
import { EXIT_TRACE_DEPTH } from '../../common/constants/bridges';

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

@ApiTags('bridge')
@Controller('bridge')
export class BridgeController {
  constructor(
    private readonly bridgeService: BridgeService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  /**
   * GET /bridge/:address
   *
   * Sync — runs immediately, no queue.
   * Returns: all cross-chain bridge transfers + detected exit wallets.
   *
   * Query params:
   *   exits=true  (default) — also trace exit wallets (Relay + identity lookup)
   *   exits=false           — skip exit tracing (faster, transfers only)
   */
  @Get(':address')
  @ApiOperation({ summary: 'Trace bridge transfers and exit wallets for an address' })
  @ApiParam({ name: 'address', description: 'EVM wallet address (0x…)' })
  @ApiQuery({ name: 'exits', required: false, type: Boolean, description: 'Trace exit wallets (default: true)' })
  @ApiResponse({ status: 200, description: 'Bridge transfers and exit wallets' })
  @ApiResponse({ status: 400, description: 'Invalid address format' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async trace(
    @Param('address') address: string,
    @Req() req: any,
    @Query('exits') exitsParam?: string,
  ) {
    if (!ETH_ADDRESS_RE.test(address)) {
      throw new BadRequestException(`Invalid EVM address: ${address}`);
    }

    // Check rate limit
    const ip = this.getClientIp(req);
    const { allowed, remaining, limit } = await this.rateLimitService.checkLimit(ip, 'bridge');
    
    if (!allowed) {
      throw new ForbiddenException({
        error: 'Rate limit exceeded',
        message: `You have reached your daily limit of ${limit} bridge trace(s). Resets at midnight UTC.`,
        scanType: 'bridge',
        limit,
        remaining: 0,
      });
    }
    
    // Increment usage
    await this.rateLimitService.increment(ip, 'bridge');

    const addr      = address.toLowerCase();
    const traceExits = exitsParam !== 'false'; // default true

    const bridges = await this.bridgeService.trace(addr);

    let exits: ExitWalletResult[] = [];
    if (traceExits) {
      const crossWalletTxs = bridges.transfers.filter((t) => t.crossWallet);
      exits = await this.bridgeService.traceExits(crossWalletTxs, EXIT_TRACE_DEPTH);
    }

    return {
      address: addr,
      bridges,
      exits,
      tracedAt: new Date().toISOString(),
      rateLimit: {
        type: 'bridge',
        remaining: remaining - 1,
        limit,
      },
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
}
