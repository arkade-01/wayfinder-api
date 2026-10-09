import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { ParsedTx, parseTransaction } from './tx-parser';

export type SortOrder = 'asc' | 'desc';

export interface SignatureEntry {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: unknown;
}

/**
 * Thin client over Helius RPC. Everything history-related goes through
 * `getTransactionsForAddress` (supports oldest-first via sortOrder: 'asc'),
 * with a standard `getSignaturesForAddress` fallback for the one call where
 * we only need the oldest signature, in case the method is unavailable on
 * the current plan.
 */
@Injectable()
export class HeliusService {
  private readonly logger = new Logger(HeliusService.name);
  private readonly http: AxiosInstance;
  private gtfaUnavailable = false;

  constructor(config: ConfigService) {
    const key = config.get<string>('HELIUS_API_KEY');
    const url =
      config.get<string>('HELIUS_RPC_URL') ??
      `https://mainnet.helius-rpc.com/?api-key=${key}`;
    if (!key && !config.get('HELIUS_RPC_URL')) {
      this.logger.warn('HELIUS_API_KEY not set — Solana modules will fail');
    }
    this.http = axios.create({ baseURL: url, timeout: 20_000 });
  }

  private async rpc<T>(method: string, params: unknown[]): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        const { data } = await this.http.post('', {
          jsonrpc: '2.0',
          id: 1,
          method,
          params,
        });
        if (data.error) {
          const err: any = new Error(`${method}: ${data.error.message}`);
          err.rpcCode = data.error.code;
          throw err;
        }
        return data.result as T;
      } catch (e: any) {
        const status = e.response?.status;
        if ((status === 429 || status >= 500) && attempt < 3) {
          await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
          continue;
        }
        throw e;
      }
    }
  }

  // ── History ───────────────────────────────────────────────────────────────

  /** Parsed transactions for an address, oldest- or newest-first. */
  async getParsedHistory(
    address: string,
    opts: { sortOrder: SortOrder; max: number },
  ): Promise<ParsedTx[]> {
    const out: ParsedTx[] = [];
    let paginationToken: string | undefined;

    while (out.length < opts.max) {
      const limit = Math.min(100, opts.max - out.length);
      const res = await this.rpc<{
        data: any[];
        paginationToken: string | null;
      }>('getTransactionsForAddress', [
        address,
        {
          transactionDetails: 'full',
          sortOrder: opts.sortOrder,
          limit,
          encoding: 'jsonParsed',
          maxSupportedTransactionVersion: 0,
          filters: { status: 'succeeded' },
          ...(paginationToken ? { paginationToken } : {}),
        },
      ]);
      for (const entry of res.data ?? []) {
        const p = parseTransaction(entry);
        if (p) out.push(p);
      }
      if (!res.paginationToken || !res.data?.length) break;
      paginationToken = res.paginationToken;
    }
    return out;
  }

  /** Signatures only (cheap — flat credit cost). */
  async getSignaturesPage(
    address: string,
    sortOrder: SortOrder,
    limit: number,
  ) {
    return this.rpc<{ data: SignatureEntry[]; paginationToken: string | null }>(
      'getTransactionsForAddress',
      [address, { transactionDetails: 'signatures', sortOrder, limit }],
    );
  }

  /** Oldest signature for an address (e.g. a token mint's creation tx). */
  async getOldestSignature(address: string): Promise<SignatureEntry | null> {
    if (!this.gtfaUnavailable) {
      try {
        const res = await this.getSignaturesPage(address, 'asc', 1);
        return res.data?.[0] ?? null;
      } catch (e: any) {
        // -32601 = method not found → plan doesn't include it; use the slow path.
        if (e.rpcCode !== -32601) throw e;
        this.logger.warn(
          'getTransactionsForAddress unavailable — falling back to backward pagination',
        );
        this.gtfaUnavailable = true;
      }
    }
    return this.oldestSignatureByBackwardPaging(address);
  }

  private async oldestSignatureByBackwardPaging(
    address: string,
    maxPages = 50,
  ): Promise<SignatureEntry | null> {
    let before: string | undefined;
    let last: SignatureEntry | null = null;
    for (let i = 0; i < maxPages; i++) {
      const page = await this.rpc<SignatureEntry[]>('getSignaturesForAddress', [
        address,
        { limit: 1000, ...(before ? { before } : {}) },
      ]);
      if (!page.length) break;
      last = page[page.length - 1];
      if (page.length < 1000) return last;
      before = last.signature;
    }
    this.logger.warn(
      `Gave up paging ${address} after ${maxPages} pages — oldest may be inaccurate`,
    );
    return last;
  }

  /** True if an address has a full page of recent activity — likely a CEX/program/bot hub. */
  async isHighFanOut(address: string, threshold: number): Promise<boolean> {
    const res = await this.getSignaturesPage(
      address,
      'desc',
      Math.min(threshold, 1000),
    );
    return (
      (res.data?.length ?? 0) >= Math.min(threshold, 1000) &&
      !!res.paginationToken
    );
  }

  // ── Accounts ──────────────────────────────────────────────────────────────

  async getAccountOwner(address: string): Promise<string | null> {
    const res = await this.rpc<{
      value: { owner: string; executable: boolean } | null;
    }>('getAccountInfo', [
      address,
      { encoding: 'base64', dataSlice: { offset: 0, length: 0 } },
    ]);
    return res.value?.owner ?? null;
  }
}
