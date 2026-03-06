import { ReportService } from './src/modules/report/report.service';
import * as fs from 'fs';

const mockResult = {
  scanId: 'test-scan-001',
  address: '0xe9b34e87386b5fa5e611c947730d88e773d2dbb0',
  cachedAt: new Date().toISOString(),
  identity: {
    ens: 'arkade.eth',
    twitter: 'arkade_eth',
    lens: null,
    farcaster: 'arkade',
    web: [{ title: 'Arkade on Twitter', link: 'https://twitter.com/arkade', snippet: 'Onchain degen...' }],
    xResults: [{ username: 'arkade_eth', name: 'Arkade', followers: 1200, bio: 'Building on ETH', score: 90, tweetUrl: '' }],
  },
  onchain: {
    balanceEth: 2.45,
    balanceUsd: 8750,
    txCount: 312,
    lastActive: '2026-02-28',
    tokens: ['USDC', 'WETH', 'ARB', 'OP'],
    nfts: [],
    topContacts: [],
  },
  bridges: {
    totalBridgedUsd: 25000,
    bridgesUsed: ['Relay', 'LI.FI', 'Arbitrum Bridge'],
    destChains: ['Arbitrum', 'Optimism', 'Base'],
    transfers: [
      {
        source: 'relay', bridge: 'Relay.link', status: 'completed',
        date: '2026-01-15T12:00:00Z',
        originChain: 'Ethereum', originChainId: 1,
        destChain: 'Arbitrum', destChainId: 42161,
        sender: '0xe9b34e87386b5fa5e611c947730d88e773d2dbb0',
        recipient: '0xe9b34e87386b5fa5e611c947730d88e773d2dbb0',
        crossWallet: false, token: 'ETH', amount: '1.5', amountUsd: '5250',
        originTx: '0xabc123', destTx: '0xdef456',
      },
      {
        source: 'lifi', bridge: 'LI.FI', status: 'completed',
        date: '2026-02-01T09:30:00Z',
        originChain: 'Ethereum', originChainId: 1,
        destChain: 'Base', destChainId: 8453,
        sender: '0xe9b34e87386b5fa5e611c947730d88e773d2dbb0',
        recipient: '0xdeadbeef1234567890abcdef1234567890abcdef',
        crossWallet: true, token: 'USDC', amount: '10000', amountUsd: '10000',
        originTx: '0x111', destTx: '0x222',
      },
    ],
  },
  exits: [
    {
      address: '0xdeadbeef1234567890abcdef1234567890abcdef',
      chain: 'Base',
      amountUsd: '10000',
      relayTxCount: 3,
      bridgesFurther: false,
      isContract: false,
      identity: { ens: null, twitter: null },
      furtherExits: [],
    },
  ],
  risk: {
    crossWalletExits: 1,
    unknownExits: 1,
    phishingContact: false,
    mixerContact: false,
    highValueBridge: true,
  },
};

async function main() {
  const svc = new ReportService();
  console.log('Generating PDF...');
  const buf = await svc.generatePdf(mockResult as any);
  fs.writeFileSync('/tmp/wayfinder-test.pdf', buf);
  console.log(`✅ PDF written to /tmp/wayfinder-test.pdf (${buf.length} bytes)`);
}

main().catch(console.error);
