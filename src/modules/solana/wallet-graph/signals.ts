import { ParsedTx } from '../helius/tx-parser';
import { GRAPH_LIMITS, SIGNAL_WEIGHTS, SignalType } from '../solana.constants';

/**
 * Pure signal extraction. Everything here works on already-fetched parsed
 * transactions so it can be unit tested without RPC.
 */

export interface Evidence {
  signal: SignalType;
  signatures: string[];
  detail: string;
}

export interface Candidate {
  address: string;
  score: number;
  evidence: Evidence[];
}

/** First wallet that sent SOL to `address`, scanning oldest-first txs. */
export function firstFunderOf(
  address: string,
  oldestFirst: ParsedTx[],
  minLamports = GRAPH_LIMITS.minTransferLamports,
): { funder: string; signature: string; lamports: number } | null {
  for (const tx of oldestFirst) {
    for (const t of tx.nativeTransfers) {
      if (t.to === address && t.from !== address && t.lamports >= minLamports) {
        return {
          funder: t.from,
          signature: tx.signature,
          lamports: t.lamports,
        };
      }
    }
  }
  return null;
}

/**
 * Wallets that paid fees for txs the target signed. A third party paying
 * your fees is close to proof of shared control (or a relayer — hence the
 * hub exclusion upstream).
 */
export function feePayersFor(
  target: string,
  txs: ParsedTx[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const tx of txs) {
    if (tx.feePayer && tx.feePayer !== target && tx.signers.includes(target)) {
      const sigs = out.get(tx.feePayer) ?? [];
      sigs.push(tx.signature);
      out.set(tx.feePayer, sigs);
    }
  }
  return out;
}

/** Counterparties by direction, with the txs that touched them. */
export function counterparties(
  target: string,
  txs: ParsedTx[],
  minLamports = GRAPH_LIMITS.minTransferLamports,
): { outgoing: Map<string, string[]>; incoming: Map<string, string[]> } {
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  const push = (m: Map<string, string[]>, k: string, sig: string) => {
    const arr = m.get(k) ?? [];
    if (!arr.includes(sig)) arr.push(sig);
    m.set(k, arr);
  };
  for (const tx of txs) {
    for (const t of tx.nativeTransfers) {
      if (t.lamports < minLamports) continue;
      if (t.from === target && t.to !== target)
        push(outgoing, t.to, tx.signature);
      if (t.to === target && t.from !== target)
        push(incoming, t.from, tx.signature);
    }
  }
  return { outgoing, incoming };
}

/** Combine independent signal weights: 1 − Π(1 − w). One signal per type counts once. */
export function combineScore(evidence: Evidence[]): number {
  const seen = new Set<SignalType>();
  let miss = 1;
  for (const e of evidence) {
    if (seen.has(e.signal)) continue;
    seen.add(e.signal);
    miss *= 1 - SIGNAL_WEIGHTS[e.signal];
  }
  return Math.round((1 - miss) * 1000) / 1000;
}

/** Accumulates evidence per address and ranks candidates. */
export class CandidateSet {
  private readonly map = new Map<string, Evidence[]>();

  constructor(private readonly target: string) {}

  add(address: string, evidence: Evidence) {
    if (address === this.target) return;
    const list = this.map.get(address) ?? [];
    list.push(evidence);
    this.map.set(address, list);
  }

  has(address: string) {
    return this.map.has(address);
  }

  ranked(): Candidate[] {
    return [...this.map.entries()]
      .map(([address, evidence]) => ({
        address,
        evidence,
        score: combineScore(evidence),
      }))
      .sort((a, b) => b.score - a.score);
  }
}
