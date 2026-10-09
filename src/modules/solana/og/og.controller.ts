import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { OgService } from './og.service';

@ApiTags('solana')
@Controller('solana/og')
export class OgController {
  constructor(private readonly og: OgService) {}

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
  ) {
    if (!q || q.trim().length < 2 || q.length > 40)
      throw new BadRequestException('q must be 2–40 characters');

    const min = Number(minLiquidity ?? 1000);
    return this.og.search(q, {
      minLiquidityUsd: Number.isFinite(min) && min >= 0 ? min : 1000,
    });
  }
}
