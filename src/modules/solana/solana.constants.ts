export const SOL_GRAPH_QUEUE_NAME = 'sol-wallet-graph';

/**
 * Bump whenever scan logic changes — cached results from an older version are
 * ignored, so users never get stale output after a heuristic update.
 */
export const GRAPH_VERSION = 3;

export const LAMPORTS_PER_SOL = 1_000_000_000;

/** Base58 Solana address (32–44 chars, no 0/O/I/l). */
export const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Programs / system accounts that must never become graph nodes.
 * CEX hot wallets are NOT hardcoded here — load them into the KnownEntity
 * collection instead (see KnownEntityService). Unknown hubs are also caught
 * automatically by fan-out detection in the wallet-graph processor.
 */
export const PROGRAM_ACCOUNTS = new Set<string>([
  '11111111111111111111111111111111', // System Program
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // SPL Token
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', // Token-2022
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', // Associated Token Account
  'ComputeBudget111111111111111111111111111111', // Compute Budget
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', // Jupiter v6
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM v4
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M4uBEwF6P', // Pump.fun
  'So11111111111111111111111111111111111111112', // Wrapped SOL mint
  // Jito tip accounts — degens tip these on nearly every trade
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
  'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
  'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
  'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
  'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
  'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
  'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
  '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
]);

export const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';

/** Graph-walk limits — keep these tight; every hop costs Helius credits. */
export const GRAPH_LIMITS = {
  /** Oldest txs pulled for the target to find its funder. */
  targetOldestTxs: 50,
  /** Most-recent txs pulled for the target (sweeps, fee payers, children). */
  targetRecentTxs: 200,
  /** Recent txs pulled for the funder to find siblings. */
  funderRecentTxs: 300,
  /** Max candidate children whose first funder we verify. */
  maxChildrenToVerify: 20,
  /** Max siblings reported per funder. */
  maxSiblings: 25,
  /**
   * Hub detection combines two inputs:
   *   - SPREAD: how many different wallets it moves SOL with / pays fees for
   *   - VOLUME: whether it has a full page (1000+) of recent signatures
   * Volume alone never excludes — heavy traders (fomo, Axiom, Photon, bots)
   * are busy but touch few wallets. Volume + spread lowers the bar, because a
   * busy address fanning out to many wallets is almost certainly infrastructure.
   */
  hubSampleTxs: 100,
  /** Recent signatures ⇒ "busy" (one cheap signatures-only call). */
  hubSignatureThreshold: 1000,
  /** Distinct wallets sent to / received from ⇒ distributor / collector. */
  hubDistinctWallets: 25,
  /** Same, when the address is busy. */
  hubDistinctWalletsBusy: 12,
  /** Distinct other signers whose fees it paid ⇒ sponsor / relayer. */
  hubSponsoredSigners: 5,
  /** Same, when busy. */
  hubSponsoredSignersBusy: 3,
  /** Not busy, but sample this full ⇒ still tag as active trader. */
  activeTraderTxs: 90,
  /** Ignore dust transfers below this (lamports) — spam/airdrops. */
  minTransferLamports: 0.001 * 1_000_000_000,
  /** Repeated transfers to the same address needed to count as a sweep. */
  sweepMinCount: 3,
};

/** Base weight of each signal. Combined per candidate as 1 − Π(1 − w). */
export const SIGNAL_WEIGHTS = {
  FEE_PAYER: 0.9,
  FUNDED_CHILD: 0.7,
  SHARED_FUNDER: 0.55,
  FUNDED_BY: 0.5,
  SWEEP_OUT: 0.5,
  SWEEP_IN: 0.4,
} as const;

export type SignalType = keyof typeof SIGNAL_WEIGHTS;
