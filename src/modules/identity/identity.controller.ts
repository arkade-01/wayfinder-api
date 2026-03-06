import { Controller, Get, Param, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { IdentityService } from './identity.service';

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

@ApiTags('identity')
@Controller('identity')
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  /**
   * GET /identity/:address
   *
   * Sync — runs immediately, no queue.
   * Returns: ENS, Twitter, Lens, Farcaster, X/social mentions,
   *          web results, and on-chain summary (balance, tx count, tokens).
   */
  @Get(':address')
  @ApiOperation({ summary: 'Resolve identity for a wallet address' })
  @ApiParam({ name: 'address', description: 'EVM wallet address (0x…)' })
  @ApiResponse({ status: 200, description: 'Identity and on-chain summary' })
  @ApiResponse({ status: 400, description: 'Invalid address format' })
  async resolve(@Param('address') address: string) {
    if (!ETH_ADDRESS_RE.test(address)) {
      throw new BadRequestException(`Invalid EVM address: ${address}`);
    }

    const addr = address.toLowerCase();

    // Run identity resolution and on-chain data in parallel
    const [identity, onchain] = await Promise.all([
      this.identityService.resolve(addr),
      this.identityService.getOnchain(addr),
    ]);

    // Run X/web search using ENS if found (same pattern as scan processor)
    const [xResults, webResults] = await Promise.all([
      this.identityService.searchX(addr, identity.ens),
      this.identityService.searchWeb(addr, identity.ens),
    ]);

    identity.xResults = xResults;
    identity.web      = webResults;

    return {
      address: addr,
      identity,
      onchain,
      resolvedAt: new Date().toISOString(),
    };
  }
}
