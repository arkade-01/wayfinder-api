// Wormhole chain ID → EVM chain ID mapping
export const WORMHOLE_CHAIN_MAP: Record<number, number> = {
  2:  1,      // Ethereum
  4:  56,     // BSC
  5:  137,    // Polygon
  6:  43114,  // Avalanche
  23: 42161,  // Arbitrum
  24: 10,     // Optimism
  30: 8453,   // Base
  34: 534352, // Scroll
};

// deBridge DLN contract addresses per chain
export const DEBRIDGE_CONTRACTS = new Set([
  '0xef4fb24ad0916217251f553c0596f8edc630eb66', // Ethereum
  '0x7791c1a492a7cbacff3d01f81c5ededbeb56c7ed', // Arbitrum
  '0x7b763af9cf3cdb9ac94d0f748d2b78a507b5660b', // Polygon
  '0xe7351fd770a37282b91d153ee690b63579d6dd7f', // BSC
  '0x43de2d77bf8027e25dbd179b491e8d64f38398aa', // Optimism
  '0xd2e1b728d215c8e979f73c50e39a2a75a5cdc032', // Base
]);

export const BRIDGE_CONTRACTS: Record<string, { name: string; dest: string }> = {
  '0x8731d54e9d02c286767d56ac03e8037c07e01e98': { name: 'Stargate',         dest: 'multi' },
  '0x150f94b44927f078737562f0fcf3c95c01cc2376': { name: 'Stargate V2',      dest: 'multi' },
  '0x3ee18b2214aff97000d974cf647e7c347e8fa585': { name: 'Wormhole',         dest: 'multi' },
  '0x4d9079bb4165aeb4084c526a32695dcfd2f77381': { name: 'Across',           dest: 'multi' },
  '0x5c7bcd6e7de5423a257d81b442095a1a6ced35c5': { name: 'Across V3',        dest: 'multi' },
  '0x2796317b0ff8538f253012862c06787adfb8ceb1': { name: 'Synapse',          dest: 'multi' },
  '0x3154cf16ccdb4c6d922629664174b904d80f2c35': { name: 'Base Bridge',      dest: 'base' },
  '0x99c9fc46f92e8a1c0dec1b1747d010903e884be1': { name: 'Optimism Bridge',  dest: 'optimism' },
  '0x8315177ab297ba92a06054ce80a67ed4dbd7ed3a': { name: 'Arbitrum Bridge',  dest: 'arbitrum' },
  '0xa0c68c638235ee32657e8f720a23cec1bfc77c77': { name: 'Polygon Bridge',   dest: 'polygon' },
  '0x66a71dcef29a0ffbdbe3c6a460a3b5bc225cd675': { name: 'LayerZero',        dest: 'multi' },
  '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae': { name: 'LI.FI',            dest: 'multi' },
  '0x80c67432656d59144ceff962e8faf8926599bcf8': { name: 'Orbiter',          dest: 'multi' },
  '0x9315222a2622efea1ebdf7aaaaba4e0b0ba34d8a': { name: 'Hop',              dest: 'arbitrum' },
  '0xb8901acb165ed027e32754e0ffe830802919727f': { name: 'Hop DAI',          dest: 'arbitrum' },
};

export const TOKEN_CONTRACTS = new Set([
  '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', // Polygon USDC
  '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', // BSC USDC
  '0xaf88d065e77c8cc2239327c5edb3a432268e5831', // Arbitrum USDC
  '0x55d398326f99059ff775485246999027b3197955', // BSC USDT
  '0xdac17f958d2ee523a2206206994597c13d831ec7', // ETH USDT
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // ETH USDC
  '0x4200000000000000000000000000000000000006', // Optimism / Base WETH
  '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // Arbitrum WETH
  '0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb', // Zora token contract (false positive — wallet #8)
  '0x3894085ef7ff0f0aedf52e2a2704928d1ec074f1', // Sei token contract (false positive — wallet #9)
]);

export const PHISHING_PATTERNS = [
  'fundsrecovery',
  'blockscanchat',
  'support-',
  'claim-',
  'airdrop-',
];

export const CHAIN_NAMES: Record<number, string> = {
  1:                  'Ethereum',
  10:                 'Optimism',
  56:                 'BSC',
  137:                'Polygon',
  324:                'zkSync',
  8453:               'Base',
  42161:              'Arbitrum',
  43114:              'Avalanche',
  534352:             'Scroll',
  59144:              'Linea',
  81457:              'Blast',
  999:                'Zora',
  7777777:            'Zora',
  1329:               'Sei',
  2741:               'Abstract',
  9286185:            'Solana (via Relay)',
  792703809:          'Solana',
};

export const CHAIN_IDS: Record<string, number> = {
  ethereum:  1,
  optimism:  10,
  bsc:       56,
  polygon:   137,
  zksync:    324,
  base:      8453,
  arbitrum:  42161,
  avalanche: 43114,
  scroll:    534352,
  linea:     59144,
  blast:     81457,
  zora:      7777777,
  sei:       1329,
};

export const CACHE_TTL_HOURS = 24;
export const SCAN_QUEUE_NAME = 'scan';
export const EXIT_TRACE_DEPTH = 2;
export const BATCH_CONCURRENCY = 5;
