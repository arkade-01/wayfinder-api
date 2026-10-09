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
                  info: { source: T, newAccount: C, lamports: 5000 },
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
