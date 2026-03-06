"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const report_service_1 = require("./src/modules/report/report.service");
const fs = __importStar(require("fs"));
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
    const svc = new report_service_1.ReportService();
    console.log('Generating PDF...');
    const buf = await svc.generatePdf(mockResult);
    fs.writeFileSync('/tmp/wayfinder-test.pdf', buf);
    console.log(`✅ PDF written to /tmp/wayfinder-test.pdf (${buf.length} bytes)`);
}
main().catch(console.error);
//# sourceMappingURL=test-pdf.js.map