import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { WalletGraphService } from './wallet-graph.service';
import { RateLimitService } from '../../ratelimit/ratelimit.service';
import { SOLANA_ADDRESS_RE } from '../solana.constants';
import { getClientIp } from '../../../common/utils/client-ip';

@ApiTags('solana')
@Controller('solana/wallets')
export class WalletGraphController {
  constructor(
    private readonly graph: WalletGraphService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Post(':address/scan')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Queue an alt-wallet (linked wallet) scan for a Solana address',
  })
  @ApiQuery({
    name: 'force',
    required: false,
    description: 'Ignore a recent cached result',
  })
  async scan(
    @Param('address') address: string,
    @Query('force') force: string,
    @Req() req: Request,
  ) {
    if (!SOLANA_ADDRESS_RE.test(address))
      throw new BadRequestException('Invalid Solana address');

    const ip = getClientIp(req);
    const { allowed, remaining, limit } = await this.rateLimit.checkLimit(
      ip,
      'sol_graph',
    );
    if (!allowed) {
      throw new ForbiddenException({
        error: 'Rate limit exceeded',
        message: `Daily limit of ${limit} Solana wallet scans reached. Resets at midnight UTC.`,
      });
    }

    const res = await this.graph.create(address, force === 'true');
    if (!res.cached) await this.rateLimit.increment(ip, 'sol_graph');
    return {
      ...res,
      rateLimit: {
        type: 'sol_graph',
        remaining: res.cached ? remaining : remaining - 1,
        limit,
      },
    };
  }

  @Get('scans/:id')
  @ApiOperation({ summary: 'Get Solana alt-wallet scan status / result' })
  async get(@Param('id') id: string) {
    if (!/^[0-9a-fA-F]{24}$/.test(id))
      throw new BadRequestException('Invalid scan ID');
    return this.graph.findOne(id);
  }

  @Get(':address/edges')
  @ApiOperation({
    summary:
      'All stored wallet links touching this address (from any past scan)',
  })
  async edges(@Param('address') address: string) {
    if (!SOLANA_ADDRESS_RE.test(address))
      throw new BadRequestException('Invalid Solana address');
    return this.graph.edgesFor(address);
  }
}
