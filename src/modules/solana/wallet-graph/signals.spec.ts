import { parseTransaction, ParsedTx } from '../helius/tx-parser';
import {
  CandidateSet,
  combineScore,
  counterparties,
  feePayersFor,
  firstFunderOf,
} from './signals';

const T = 'TargetWa11et1111111111111111111111111111111';
const F = 'FunderWa11et1111111111111111111111111111111';
const P = 'PayerWa11et11111111111111111111111111111111';
const C = 'ChildWa11et11111111111111111111111111111111';
const SOL = 1_000_000_000;

function tx(sig: string, opts: Partial<ParsedTx>): ParsedTx {
  return {
    signature: sig,
    slot: 1,
    blockTime: 1,
    success: true,
    feePayer: T,
    signers: [T],
    nativeTransfers: [],
    tokenDeltas: [],
    ...opts,
  };
}

describe('tx-parser', () => {
  it('extracts system transfers (outer + inner), fee payer, signers and token deltas', () => {
    const entry = {
      slot: 10,
      blockTime: 1700000000,
      transaction: {
        signatures: ['sig1'],
        message: {
          accountKeys: [
            { pubkey: P, signer: true, writable: true },
            { pubkey: T, signer: true, writable: true },
            { pubkey: C, signer: false, writable: true },
          ],
          instructions: [
            {
              program: 'system',
              parsed: {
                type: 'transfer',
                info: { source: T, destination: C, lamports: 2 * SOL },
              },
            },
            { program: 'spl-token', parsed: { type: 'transfer', info: {} } },
          ],
        },
      },
      meta: {
        err: null,
        innerInstructions: [
          {
            index: 0,
            instructions: [
              {
                program: 'system',
                parsed: {
                  type: 'createAccount',
                  info: {
                    source: T,
                    newAccount: C,
                    lamports: 5000,
                    owner: '11111111111111111111111111111111',
                  },
                },
              },
            ],
          },
        ],
        preTokenBalances: [
          { owner: T, mint: 'M', uiTokenAmount: { uiAmountString: '10' } },
        ],
        postTokenBalances: [
          { owner: T, mint: 'M', uiTokenAmount: { uiAmountString: '4' } },
          { owner: C, mint: 'M', uiTokenAmount: { uiAmountString: '6' } },
        ],
      },
    };
    const p = parseTransaction(entry)!;
    expect(p.signature).toBe('sig1');
    expect(p.feePayer).toBe(P);
    expect(p.signers).toEqual([P, T]);
    expect(p.nativeTransfers).toEqual([
      { from: T, to: C, lamports: 2 * SOL },
      { from: T, to: C, lamports: 5000 },
    ]);
    expect(p.tokenDeltas).toEqual(
      expect.arrayContaining([
        { owner: T, mint: 'M', delta: -6 },
        { owner: C, mint: 'M', delta: 6 },
      ]),
    );
  });

  it('returns null for malformed entries', () => {
    expect(parseTransaction({})).toBeNull();
  });
});

describe('signals', () => {
  it('firstFunderOf skips dust and self-transfers', () => {
    const txs = [
      tx('dust', { nativeTransfers: [{ from: 'Spam', to: T, lamports: 100 }] }),
      tx('self', { nativeTransfers: [{ from: T, to: T, lamports: SOL }] }),
      tx('real', { nativeTransfers: [{ from: F, to: T, lamports: SOL }] }),
    ];
    expect(firstFunderOf(T, txs)).toEqual({
      funder: F,
      signature: 'real',
      lamports: SOL,
    });
  });

  it('feePayersFor only counts txs the target signed', () => {
    const txs = [
      tx('a', { feePayer: P, signers: [P, T] }),
      tx('b', { feePayer: P, signers: [P] }), // target didn't sign — irrelevant
      tx('c', { feePayer: T, signers: [T] }),
    ];
    expect([...feePayersFor(T, txs)]).toEqual([[P, ['a']]]);
  });

  it('counterparties splits by direction and dedupes signatures', () => {
    const txs = [
      tx('1', {
        nativeTransfers: [
          { from: T, to: C, lamports: SOL },
          { from: T, to: C, lamports: SOL },
        ],
      }),
      tx('2', { nativeTransfers: [{ from: F, to: T, lamports: SOL }] }),
    ];
    const { outgoing, incoming } = counterparties(T, txs);
    expect(outgoing.get(C)).toEqual(['1']);
    expect(incoming.get(F)).toEqual(['2']);
  });

  it('combineScore counts each signal type once', () => {
    const e = (signal: any) => ({ signal, signatures: [], detail: '' });
    expect(combineScore([e('FEE_PAYER')])).toBe(0.9);
    expect(combineScore([e('FUNDED_BY'), e('FUNDED_BY')])).toBe(0.5);
    expect(combineScore([e('FUNDED_BY'), e('SWEEP_OUT')])).toBe(0.75);
  });

  it('CandidateSet ignores the target and ranks by score', () => {
    const set = new CandidateSet(T);
    set.add(T, { signal: 'FEE_PAYER', signatures: [], detail: '' });
    set.add(C, { signal: 'SWEEP_IN', signatures: [], detail: '' });
    set.add(P, { signal: 'FEE_PAYER', signatures: [], detail: '' });
    expect(set.ranked().map((c) => c.address)).toEqual([P, C]);
  });
});

describe('profileAddress (hub vs degen)', () => {
  const { profileAddress } = require('./signals');
  const L = {
    hubDistinctWallets: 25,
    hubSponsoredSigners: 5,
    activeTraderTxs: 90,
  };
  const wallets = (n: number, p: string) =>
    Array.from({ length: n }, (_, i) => `${p}${i}`);
  const A = 'Addr';

  it('busy trader touching few wallets is an active trader, not a hub', () => {
    const txs = Array.from({ length: 100 }, (_, i) =>
      tx(`s${i}`, {
        feePayer: A,
        signers: [A],
        nativeTransfers: [{ from: A, to: `Fee${i % 3}`, lamports: 0.01 * SOL }],
      }),
    );
    expect(profileAddress(A, txs, () => true, L).kind).toBe('active_trader');
  });

  it('sending to many distinct wallets is a distributor', () => {
    const txs = wallets(30, 'W').map((w, i) =>
      tx(`d${i}`, {
        feePayer: A,
        signers: [A],
        nativeTransfers: [{ from: A, to: w, lamports: SOL }],
      }),
    );
    expect(profileAddress(A, txs, () => true, L).kind).toBe('distributor');
  });

  it('receiving from many distinct wallets is a collector', () => {
    const txs = wallets(30, 'W').map((w, i) =>
      tx(`c${i}`, {
        feePayer: w,
        signers: [w],
        nativeTransfers: [{ from: w, to: A, lamports: 0.01 * SOL }],
      }),
    );
    expect(profileAddress(A, txs, () => true, L).kind).toBe('collector');
  });

  it('paying fees for many signers is a sponsor', () => {
    const txs = wallets(6, 'U').map((u, i) =>
      tx(`p${i}`, { feePayer: A, signers: [A, u] }),
    );
    expect(profileAddress(A, txs, () => true, L).kind).toBe('sponsor');
  });

  it('non-wallet counterparties (pools, bonding curves) are ignored', () => {
    const txs = wallets(60, 'Pool').map((w, i) =>
      tx(`b${i}`, {
        feePayer: A,
        signers: [A],
        nativeTransfers: [{ from: A, to: w, lamports: SOL }],
      }),
    );
    expect(
      profileAddress(A, txs, (a: string) => !a.startsWith('Pool'), L).kind,
    ).toBe('normal');
  });
});

describe('tx-parser createAccount', () => {
  it('ignores createAccount for non-system owners (temp WSOL, ATAs)', () => {
    const mk = (owner: string) =>
      parseTransaction({
        slot: 1,
        blockTime: 1,
        transaction: {
          signatures: ['x'],
          message: {
            accountKeys: [{ pubkey: T, signer: true }],
            instructions: [
              {
                program: 'system',
                parsed: {
                  type: 'createAccount',
                  info: { source: T, newAccount: C, lamports: 2039280, owner },
                },
              },
            ],
          },
        },
        meta: { err: null },
      })!;
    expect(
      mk('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA').nativeTransfers,
    ).toEqual([]);
    expect(mk('11111111111111111111111111111111').nativeTransfers).toHaveLength(
      1,
    );
  });
});

describe('profileAddress volume + spread', () => {
  const { profileAddress } = require('./signals');
  const L = {
    hubDistinctWallets: 25,
    hubDistinctWalletsBusy: 12,
    hubSponsoredSigners: 5,
    hubSponsoredSignersBusy: 3,
    activeTraderTxs: 90,
  };
  const A = 'Addr';
  const sendTo = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      tx(`v${i}`, {
        feePayer: A,
        signers: [A],
        nativeTransfers: [{ from: A, to: `W${i}`, lamports: SOL }],
      }),
    );

  it('busy + moderate spread is a hub', () => {
    expect(profileAddress(A, sendTo(15), () => true, L, true).kind).toBe(
      'distributor',
    );
  });
  it('quiet + same moderate spread is not', () => {
    expect(profileAddress(A, sendTo(15), () => true, L, false).kind).toBe(
      'normal',
    );
  });
  it('busy + low spread is an active trader (kept)', () => {
    expect(profileAddress(A, sendTo(4), () => true, L, true).kind).toBe(
      'active_trader',
    );
  });
});
