import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { WalletGraphService } from './wallet-graph.service';
import { SOLANA_ADDRESS_RE } from '../solana.constants';

@ApiTags('solana')
@Controller('solana/wallets')
export class WalletGraphController {
  constructor(private readonly graph: WalletGraphService) {}

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
  async scan(@Param('address') address: string, @Query('force') force: string) {
    if (!SOLANA_ADDRESS_RE.test(address))
      throw new BadRequestException('Invalid Solana address');
    return this.graph.create(address, force === 'true');
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
