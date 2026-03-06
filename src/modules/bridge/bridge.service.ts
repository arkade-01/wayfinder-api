import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  BridgeResult, BridgeTransfer,
  ExitWalletResult, FurtherExit,
} from '../../common/interfaces/wallet.interface';
import {
  BRIDGE_CONTRACTS, TOKEN_CONTRACTS,
  CHAIN_NAMES, WORMHOLE_CHAIN_MAP, DEBRIDGE_CONTRACTS,
} from '../../common/constants/bridges';
import { IdentityService } from '../identity/identity.service';

@Injectable()
export class BridgeService {
  private readonly logger = new Logger(BridgeService.name);

  constructor(
    private config: ConfigService,
    private identity: IdentityService,
  ) {}

  async trace(address: string): Promise<BridgeResult> {
    const [relayTransfers, lifiTransfers, officialTransfers, wormholeTransfers, debridgeTransfers] = await Promise.all([
      this.getRelayTransfers(address),
      this.getLifiTransfers(address),
      this.getOfficialBridgeTxs(address),
      this.getWormholeTransfers(address),
      this.getDeBridgeTransfers(address),
    ]);

    const all = [
      ...relayTransfers,
      ...lifiTransfers,
      ...officialTransfers,
      ...wormholeTransfers,
      ...debridgeTransfers,
    ];

    // Deduplicate by originTx hash
    const seen  = new Set<string>();
    const unique = all.filter((t) => {
      const key = t.originTx || `${t.bridge}-${t.date}-${t.amount}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const totalUsd   = unique.reduce((s, t) => s + (parseFloat(t.amountUsd) || 0), 0);
    const bridges    = [...new Set(unique.map((t) => t.bridge))];
    const destChains = [...new Set(unique.map((t) => t.destChain).filter(Boolean))];

    return {
      totalBridgedUsd: Math.round(totalUsd * 100) / 100,
      bridgesUsed:     bridges,
      destChains,
      transfers:       unique,
    };
  }

  // ── Relay.link ──────────────────────────────────────────────────────────────
  private async getRelayTransfers(address: string): Promise<BridgeTransfer[]> {
    const results: BridgeTransfer[] = [];
    let continuation: string | null = null;

    while (true) {
      try {
        const params: any = { user: address, limit: 50 };
        if (continuation) params.continuation = continuation;

        const { data } = await axios.get('https://api.relay.link/requests/v2', {
          params, timeout: 15000,
        });

        for (const tx of data?.requests || []) {
          if (tx.status !== 'success') continue;
          results.push(this.parseRelayTx(tx, address));
        }

        continuation = data?.continuation || null;
        if (!continuation || (data?.requests?.length || 0) < 50) break;
      } catch (e) {
        this.logger.warn(`Relay failed for ${address}: ${e.message}`);
        break;
      }
    }

    return results;
  }

  private parseRelayTx(tx: any, address: string): BridgeTransfer {
    const meta    = tx?.data?.metadata || {};
    const inTxs   = tx?.data?.inTxs  || [];
    const outTxs  = tx?.data?.outTxs || [];
    const inTx    = inTxs[0]  || {};
    const outTx   = outTxs[0] || {};

    const sender    = (inTx?.data?.from  || tx.user        || '').toLowerCase();
    const recipient = (outTx?.data?.to   || tx.recipient   || '').toLowerCase();
    const amtIn     = meta?.currencyIn   || {};
    const amtOut    = meta?.currencyOut  || {};

    return {
      source:        'relay',
      bridge:        'Relay.link',
      status:        tx.status,
      date:          (tx.createdAt || '').slice(0, 10),
      originChain:   this.chainName(inTx?.chainId),
      originChainId: inTx?.chainId || null,
      destChain:     this.chainName(outTx?.chainId),
      destChainId:   outTx?.chainId || null,
      sender,
      recipient,
      crossWallet:   this.isCrossWallet(sender, recipient),
      token:         amtIn?.currency?.symbol || '?',
      amount:        amtIn?.amountFormatted  || '?',
      amountUsd:     amtIn?.amountUsd        || '0',
      originTx:      inTx?.hash   || '',
      destTx:        outTx?.hash  || '',
    };
  }

  // ── LI.FI ──────────────────────────────────────────────────────────────────
  private async getLifiTransfers(address: string): Promise<BridgeTransfer[]> {
    try {
      const { data } = await axios.get('https://li.quest/v1/analytics/transfers', {
        params: { wallet: address, status: 'ALL' },
        timeout: 15000,
      });
      return (data?.transfers || []).map((tx: any) => this.parseLifiTx(tx, address));
    } catch (e) {
      this.logger.warn(`LI.FI failed for ${address}: ${e.message}`);
      return [];
    }
  }

  private parseLifiTx(tx: any, address: string): BridgeTransfer {
    const sending   = tx?.sending   || {};
    const receiving = tx?.receiving || {};
    const sender    = (sending?.fromAddress  || address).toLowerCase();
    const recipient = (receiving?.toAddress  || sender).toLowerCase();

    const ts = sending?.timestamp;
    const date = ts ? new Date(ts * 1000).toISOString().slice(0, 10) : '';

    return {
      source:        'lifi',
      bridge:        tx.bridge || 'LI.FI',
      status:        tx.status,
      date,
      originChain:   this.chainName(sending?.chainId),
      originChainId: sending?.chainId   || null,
      destChain:     this.chainName(receiving?.chainId),
      destChainId:   receiving?.chainId || null,
      sender,
      recipient,
      crossWallet:   this.isCrossWallet(sender, recipient),
      token:         sending?.token?.symbol || '?',
      amount:        sending?.amount        || '?',
      amountUsd:     sending?.amountUSD     || '0',
      originTx:      sending?.txHash   || '',
      destTx:        receiving?.txHash || '',
    };
  }

  // ── Etherscan official bridges ──────────────────────────────────────────────
  private async getOfficialBridgeTxs(address: string): Promise<BridgeTransfer[]> {
    const key = this.config.get('ETHERSCAN_API_KEY');
    try {
      const { data } = await axios.get('https://api.etherscan.io/v2/api', {
        params: {
          chainid: 1, module: 'account', action: 'txlist',
          address, sort: 'desc', apikey: key,
        },
        timeout: 15000,
      });

      const txs: any[] = data?.status === '1' ? data.result : [];
      const results: BridgeTransfer[] = [];

      for (const tx of txs) {
        const to = (tx.to || '').toLowerCase();
        if (!BRIDGE_CONTRACTS[to]) continue;

        const { name, dest } = BRIDGE_CONTRACTS[to];
        if (dest === 'multi') continue; // handled by Relay/LI.FI

        const valueEth = parseInt(tx.value || '0') / 1e18;
        if (valueEth < 0.001) continue;

        const destChainIds: Record<string, number> = {
          base: 8453, optimism: 10, arbitrum: 42161, polygon: 137,
        };

        results.push({
          source:        'etherscan',
          bridge:        name,
          status:        tx.isError === '0' ? 'success' : 'failed',
          date:          new Date(parseInt(tx.timeStamp) * 1000).toISOString().slice(0, 10),
          originChain:   'Ethereum',
          originChainId: 1,
          destChain:     dest.charAt(0).toUpperCase() + dest.slice(1),
          destChainId:   destChainIds[dest] || null,
          sender:        address.toLowerCase(),
          recipient:     address.toLowerCase(),
          crossWallet:   false,
          token:         'ETH',
          amount:        valueEth.toFixed(4),
          amountUsd:     '0',
          originTx:      tx.hash,
          destTx:        '',
        });
      }

      return results;
    } catch (e) {
      this.logger.warn(`Etherscan bridge scan failed for ${address}: ${e.message}`);
      return [];
    }
  }

  // ── Wormhole ────────────────────────────────────────────────────────────────
  private async getWormholeTransfers(address: string): Promise<BridgeTransfer[]> {
    const results: BridgeTransfer[] = [];
    let page = 0;

    while (page < 5) { // max 5 pages
      try {
        const { data } = await axios.get('https://api.wormholescan.io/api/v1/operations', {
          params: { address, page, pageSize: 50 },
          timeout: 15000,
        });

        const ops: any[] = data?.operations || [];
        if (!ops.length) break;

        for (const op of ops) {
          const src   = op.sourceChain || {};
          const dst   = op.targetChain || {};
          const props = op.content?.standarizedProperties || {};

          const sender    = (src.from || '').toLowerCase();
          const recipient = (props.toAddress || dst.to || '').toLowerCase();

          // Convert Wormhole chain IDs to EVM chain IDs
          const srcChainId = WORMHOLE_CHAIN_MAP[props.fromChain || src.chainId] || null;
          const dstChainId = WORMHOLE_CHAIN_MAP[props.toChain   || dst.chainId] || null;

          results.push({
            source:        'wormhole' as any,
            bridge:        'Wormhole',
            status:        dst.status || 'unknown',
            date:          (src.timestamp || '').slice(0, 10),
            originChain:   this.chainName(srcChainId || src.chainId),
            originChainId: srcChainId,
            destChain:     this.chainName(dstChainId || dst.chainId),
            destChainId:   dstChainId,
            sender,
            recipient,
            crossWallet:   this.isCrossWallet(sender, recipient),
            token:         props.tokenAddress ? 'TOKEN' : '?',
            amount:        props.amount || '?',
            amountUsd:     '0',
            originTx:      src.transaction?.txHash  || '',
            destTx:        dst.transaction?.txHash  || '',
          });
        }

        if (ops.length < 50) break;
        page++;
      } catch (e) {
        this.logger.warn(`Wormhole failed for ${address}: ${e.message}`);
        break;
      }
    }

    return results;
  }

  // ── deBridge — Etherscan contract detection ─────────────────────────────────
  private async getDeBridgeTransfers(address: string): Promise<BridgeTransfer[]> {
    const key = this.config.get('ETHERSCAN_API_KEY');
    const results: BridgeTransfer[] = [];

    // Check each chain where deBridge is deployed
    const chains = [
      { id: 1,     name: 'Ethereum' },
      { id: 42161, name: 'Arbitrum' },
      { id: 137,   name: 'Polygon'  },
      { id: 56,    name: 'BSC'      },
      { id: 10,    name: 'Optimism' },
      { id: 8453,  name: 'Base'     },
    ];

    for (const chain of chains) {
      try {
        const { data } = await axios.get('https://api.etherscan.io/v2/api', {
          params: {
            chainid: chain.id, module: 'account', action: 'txlist',
            address, sort: 'desc', apikey: key,
          },
          timeout: 10000,
        });

        const txs: any[] = data?.status === '1' ? data.result : [];

        for (const tx of txs) {
          const to = (tx.to || '').toLowerCase();
          if (!DEBRIDGE_CONTRACTS.has(to)) continue;

          const valueEth = parseInt(tx.value || '0') / 1e18;

          results.push({
            source:        'debridge' as any,
            bridge:        'deBridge',
            status:        tx.isError === '0' ? 'success' : 'failed',
            date:          new Date(parseInt(tx.timeStamp) * 1000).toISOString().slice(0, 10),
            originChain:   chain.name,
            originChainId: chain.id,
            destChain:     'Unknown', // deBridge API unavailable for dest resolution
            destChainId:   null,
            sender:        address.toLowerCase(),
            recipient:     address.toLowerCase(),
            crossWallet:   false,
            token:         valueEth > 0 ? 'ETH' : 'TOKEN',
            amount:        valueEth > 0 ? valueEth.toFixed(4) : '?',
            amountUsd:     '0',
            originTx:      tx.hash,
            destTx:        '', // unresolvable without deBridge API
          });
        }
      } catch (e) {
        this.logger.warn(`deBridge scan failed on chain ${chain.id}: ${e.message}`);
      }
    }

    return results;
  }

  // ── Exit tracing ────────────────────────────────────────────────────────────
  async traceExits(
    crossWalletTxs: BridgeTransfer[],
    maxDepth: number,
    depth = 0,
  ): Promise<ExitWalletResult[]> {
    if (depth >= maxDepth) return [];

    // Filter out token contracts + non-EVM
    const realExits = crossWalletTxs.filter(
      (t) =>
        t.recipient.startsWith('0x') &&
        !TOKEN_CONTRACTS.has(t.recipient) &&
        !t.recipient.startsWith('0x000000'),
    );

    // Deduplicate by recipient
    const unique = new Map<string, BridgeTransfer>();
    for (const t of realExits) {
      if (!unique.has(t.recipient)) unique.set(t.recipient, t);
    }

    const exits: ExitWalletResult[] = [];

    for (const [recipient, tx] of unique) {
      try {
        const [exitIdentity, relayTxs, isContract] = await Promise.all([
          this.identity.resolve(recipient),
          this.getRelayTransfers(recipient),
          this.checkIsContract(recipient),
        ]);

        if (isContract) continue; // skip contracts

        const furtherCrossWallet = relayTxs.filter((t) => t.crossWallet);
        const furtherExits: FurtherExit[] = furtherCrossWallet.slice(0, 3).map((t) => ({
          recipient:  t.recipient,
          amount:     t.amount,
          token:      t.token,
          fromChain:  t.originChainId || t.originChain,
          toChain:    t.destChainId   || t.destChain,
        }));

        exits.push({
          address:        recipient,
          chain:          tx.destChain,
          identity:       exitIdentity,
          amountUsd:      tx.amountUsd,
          relayTxCount:   relayTxs.length,
          bridgesFurther: furtherExits.length > 0,
          isContract:     false,
          furtherExits,
        });
      } catch (e) {
        this.logger.warn(`Exit trace failed for ${recipient}: ${e.message}`);
      }
    }

    return exits;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  private chainName(chainId: number | null): string {
    if (!chainId) return 'Unknown';
    return CHAIN_NAMES[chainId] || `Chain-${chainId}`;
  }

  private isCrossWallet(sender: string, recipient: string): boolean {
    return (
      !!sender &&
      !!recipient &&
      sender !== recipient &&
      !TOKEN_CONTRACTS.has(recipient) &&
      recipient.startsWith('0x')
    );
  }

  private async checkIsContract(address: string): Promise<boolean> {
    const key = this.config.get('ETHERSCAN_API_KEY');
    try {
      const { data } = await axios.get('https://api.etherscan.io/v2/api', {
        params: {
          chainid: 1, module: 'contract',
          action: 'getabi', address, apikey: key,
        },
        timeout: 8000,
      });
      return data?.status === '1';
    } catch {
      return false;
    }
  }
}
