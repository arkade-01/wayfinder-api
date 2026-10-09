/**
 * Minimal parser for `jsonParsed` Solana transactions (the `full` mode of
 * Helius getTransactionsForAddress, or plain getTransaction).
 *
 * We parse ourselves instead of using Helius' Enhanced Transactions API,
 * which Helius now lists as legacy / maintenance mode. Pure functions — no I/O.
 */

export interface NativeTransfer {
  from: string;
  to: string;
  lamports: number;
}

export interface TokenDelta {
  owner: string;
  mint: string;
  /** UI amount change (post − pre). Positive = received. */
  delta: number;
}

export interface ParsedTx {
  signature: string;
  slot: number;
  blockTime: number | null;
  success: boolean;
  feePayer: string;
  signers: string[];
  nativeTransfers: NativeTransfer[];
  tokenDeltas: TokenDelta[];
}

type AnyIx = {
  program?: string;
  programId?: string;
  parsed?: { type?: string; info?: Record<string, any> } | string;
};

const SYSTEM_TRANSFER_TYPES = new Set(['transfer', 'transferWithSeed']);
const SYSTEM_CREATE_TYPES = new Set(['createAccount', 'createAccountWithSeed']);

function keyOf(k: any): string {
  return typeof k === 'string' ? k : k?.pubkey;
}

function extractNative(ix: AnyIx): NativeTransfer | null {
  if (ix.program !== 'system' || !ix.parsed || typeof ix.parsed === 'string')
    return null;
  const { type, info } = ix.parsed;
  if (!type || !info) return null;

  if (SYSTEM_TRANSFER_TYPES.has(type) && info.source && info.destination) {
    return {
      from: info.source,
      to: info.destination,
      lamports: Number(info.lamports ?? 0),
    };
  }
  // createAccount also funds rent for token/program accounts (temp WSOL, ATAs,
  // pool state) — those aren't wallets, so only count system-owned creations.
  if (
    SYSTEM_CREATE_TYPES.has(type) &&
    info.source &&
    info.newAccount &&
    info.owner === '11111111111111111111111111111111'
  ) {
    return {
      from: info.source,
      to: info.newAccount,
      lamports: Number(info.lamports ?? 0),
    };
  }
  return null;
}

function tokenDeltas(meta: any): TokenDelta[] {
  const pre: any[] = meta?.preTokenBalances ?? [];
  const post: any[] = meta?.postTokenBalances ?? [];
  const sums = new Map<string, TokenDelta>();

  const add = (b: any, sign: 1 | -1) => {
    if (!b?.owner || !b?.mint) return;
    const k = `${b.owner}:${b.mint}`;
    const amt = Number(
      b.uiTokenAmount?.uiAmountString ?? b.uiTokenAmount?.uiAmount ?? 0,
    );
    const cur = sums.get(k) ?? { owner: b.owner, mint: b.mint, delta: 0 };
    cur.delta += sign * amt;
    sums.set(k, cur);
  };

  pre.forEach((b) => add(b, -1));
  post.forEach((b) => add(b, 1));
  return [...sums.values()].filter((d) => Math.abs(d.delta) > 1e-12);
}

export function parseTransaction(entry: any): ParsedTx | null {
  const tx = entry?.transaction;
  const meta = entry?.meta;
  const message = tx?.message;
  if (!message) return null;

  const keys: any[] = message.accountKeys ?? [];
  const feePayer = keyOf(keys[0]);
  const signers = keys
    .filter((k) => typeof k === 'object' && k.signer)
    .map((k) => k.pubkey as string);

  const nativeTransfers: NativeTransfer[] = [];
  const outer: AnyIx[] = message.instructions ?? [];
  const inner: AnyIx[] = (meta?.innerInstructions ?? []).flatMap(
    (g: any) => g.instructions ?? [],
  );
  for (const ix of [...outer, ...inner]) {
    const t = extractNative(ix);
    if (t && t.lamports > 0) nativeTransfers.push(t);
  }

  return {
    signature: tx.signatures?.[0] ?? '',
    slot: entry.slot,
    blockTime: entry.blockTime ?? null,
    success: !meta?.err,
    feePayer,
    signers: signers.length ? signers : feePayer ? [feePayer] : [],
    nativeTransfers,
    tokenDeltas: tokenDeltas(meta),
  };
}
