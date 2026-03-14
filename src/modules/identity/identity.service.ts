import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  WalletIdentity, WalletOnchain,
  XResult, WebResult,
} from '../../common/interfaces/wallet.interface';

@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);

  constructor(private config: ConfigService) {}

  // ── web3.bio — ENS, Lens, Farcaster ────────────────────────────────────────
  async resolve(address: string): Promise<WalletIdentity> {
    const result: WalletIdentity = {
      ens: null, twitter: null, lens: null,
      farcaster: null, web: [], xResults: [],
    };
    try {
      const { data } = await axios.get(
        `https://api.web3.bio/profile/${address}`,
        { timeout: 10000 },
      );
      const profiles: any[] = Array.isArray(data) ? data : [];
      for (const p of profiles) {
        const plt = (p.platform || '').toLowerCase();
        if (plt === 'ens')       result.ens       = p.identity;
        if (plt === 'twitter')   result.twitter   = p.identity;
        if (plt === 'lens')      result.lens      = p.identity;
        if (plt === 'farcaster') result.farcaster = p.identity;

        // Also extract Twitter from the profile's links object (e.g. ENS profiles
        // link Twitter via `links.twitter.handle` even without a top-level twitter entry)
        if (!result.twitter && p.links?.twitter?.handle) {
          result.twitter = p.links.twitter.handle;
        }
      }
    } catch (e) {
      this.logger.warn(`web3.bio failed for ${address}: ${e.message}`);
    }

    // ── ENS fallback via ENSideas if web3.bio missed it ──────────────────────
    if (!result.ens) {
      try {
        const { data } = await axios.get(
          `https://api.ensideas.com/ens/resolve/${address}`,
          { timeout: 8000 },
        );
        if (data?.name && !data.name.startsWith('0x')) {
          result.ens = data.name;
        }
      } catch (e) {
        this.logger.warn(`ENSideas fallback failed for ${address}: ${e.message}`);
      }
    }

    return result;
  }

  // ── Etherscan V2 — on-chain data ────────────────────────────────────────────
  async getOnchain(address: string): Promise<WalletOnchain> {
    const key     = this.config.get('ETHERSCAN_API_KEY');
    const base    = 'https://api.etherscan.io/v2/api';
    const chainid = 1;

    const [balRes, txRes, tokRes, nftRes] = await Promise.allSettled([
      axios.get(base, { params: { chainid, module: 'account', action: 'balance',      address, apikey: key }, timeout: 10000 }),
      axios.get(base, { params: { chainid, module: 'account', action: 'txlist',       address, sort: 'desc', page: 1, offset: 20, apikey: key }, timeout: 10000 }),
      axios.get(base, { params: { chainid, module: 'account', action: 'tokentx',      address, sort: 'desc', page: 1, offset: 50, apikey: key }, timeout: 10000 }),
      axios.get(base, { params: { chainid, module: 'account', action: 'tokennfttx',   address, sort: 'desc', page: 1, offset: 20, apikey: key }, timeout: 10000 }),
    ]);

    const balEth   = balRes.status === 'fulfilled' && balRes.value.data.status === '1'
      ? parseInt(balRes.value.data.result) / 1e18 : 0;

    const txs      = txRes.status === 'fulfilled' && txRes.value.data.status === '1'
      ? (txRes.value.data.result as any[]) : [];

    const tokenTxs = tokRes.status === 'fulfilled' && tokRes.value.data.status === '1'
      ? (tokRes.value.data.result as any[]) : [];

    const nftTxs   = nftRes.status === 'fulfilled' && nftRes.value.data.status === '1'
      ? (nftRes.value.data.result as any[]) : [];

    const tokens = [...new Set(tokenTxs.map((t: any) => t.tokenSymbol).filter(Boolean))];
    const nfts   = [...new Set(nftTxs.map((t: any) => t.tokenName).filter(Boolean))];

    const contacts = txs
      .flatMap((t: any) => [t.from?.toLowerCase(), t.to?.toLowerCase()])
      .filter((a) => a && a !== address.toLowerCase());
    const topContacts = [...new Set(contacts)].slice(0, 5);

    const lastTx   = txs[0]?.timeStamp
      ? new Date(parseInt(txs[0].timeStamp) * 1000).toISOString().slice(0, 10)
      : null;

    return {
      balanceEth:  balEth,
      balanceUsd:  0, // TODO: multiply by ETH price
      txCount:     txs.length,
      lastActive:  lastTx || '',
      tokens:      tokens.slice(0, 10),
      nfts:        nfts.slice(0, 10),
      topContacts,
    };
  }

  // ── SocialData — X/Twitter search ──────────────────────────────────────────
  async searchX(address: string, ens: string | null, farcaster: string | null = null, knownTwitter: string | null = null): Promise<XResult[]> {
    const key     = this.config.get('SOCIALDATA_API_KEY');
    const headers = { Authorization: `Bearer ${key}`, Accept: 'application/json' };
    const results: XResult[] = [];
    const seen    = new Set<string>();

    // ── 0. Known Twitter handle (from web3.bio links — highest confidence) ──
    if (knownTwitter) {
      try {
        const { data } = await axios.get(
          `https://api.socialdata.tools/twitter/user/${knownTwitter}`,
          { headers, timeout: 8000 },
        );
        if (data?.id_str && !this.isBot(data)) {
          seen.add(data.id_str);
          const score = this.scoreUser(data, address, ens);
          results.push({
            username:   data.screen_name,
            name:       data.name,
            followers:  data.followers_count,
            bio:        (data.description || '').slice(0, 150),
            score:      score + 70, // highest bonus — directly linked via web3.bio
            tweetUrl:   `https://x.com/${data.screen_name}`,
            confidence: 'high',
          });
        }
      } catch (e) {
        this.logger.warn(`Known Twitter handle lookup failed for ${knownTwitter}: ${e.message}`);
      }
    }

    // ── 1. Direct ENS handle lookup (only if no known twitter and handle differs) ─
    if (!knownTwitter && ens) {
      const ensHandle = ens.replace('.eth', '');
      try {
        const { data } = await axios.get(
          `https://api.socialdata.tools/twitter/user/${ensHandle}`,
          { headers, timeout: 8000 },
        );
        if (data?.id_str && !this.isBot(data)) {
          seen.add(data.id_str);
          const score = this.scoreUser(data, address, ens);
          results.push({
            username:   data.screen_name,
            name:       data.name,
            followers:  data.followers_count,
            bio:        (data.description || '').slice(0, 150),
            score:      score + 50, // bonus for exact ENS match
            tweetUrl:   `https://x.com/${data.screen_name}`,
            confidence: 'high',
          });
        }
      } catch (e) {
        this.logger.warn(`ENS handle lookup failed for ${ensHandle}: ${e.message}`);
      }
    }

    // ── 2. Farcaster → Twitter cross-reference ───────────────────────────────
    if (farcaster && results.length === 0) {
      try {
        const { data } = await axios.get(
          `https://api.web3.bio/profile/farcaster/${farcaster}`,
          { timeout: 8000 },
        );
        const profiles: any[] = Array.isArray(data) ? data : [];
        const twitterProfile = profiles.find((p: any) => (p.platform || '').toLowerCase() === 'twitter');
        if (twitterProfile?.identity) {
          try {
            const { data: tUser } = await axios.get(
              `https://api.socialdata.tools/twitter/user/${twitterProfile.identity}`,
              { headers, timeout: 8000 },
            );
            if (tUser?.id_str && !seen.has(tUser.id_str) && !this.isBot(tUser)) {
              seen.add(tUser.id_str);
              results.push({
                username:   tUser.screen_name,
                name:       tUser.name,
                followers:  tUser.followers_count,
                bio:        (tUser.description || '').slice(0, 150),
                score:      this.scoreUser(tUser, address, ens) + 40, // bonus for farcaster cross-ref
                tweetUrl:   `https://x.com/${tUser.screen_name}`,
                confidence: 'high',
              });
            }
          } catch (e) {
            this.logger.warn(`Farcaster Twitter lookup failed: ${e.message}`);
          }
        }
      } catch (e) {
        this.logger.warn(`Farcaster cross-ref failed for ${farcaster}: ${e.message}`);
      }
    }

    // ── 3. Broad search fallback (only if no high-confidence result yet) ─────
    if (results.length === 0) {
      const queries = [address];
      if (ens) {
        queries.push(ens);
        queries.push(ens.replace('.eth', ''));
      }

      for (const q of queries) {
        try {
          const { data } = await axios.get('https://api.socialdata.tools/twitter/search', {
            headers,
            params: { query: q, type: 'Latest' },
            timeout: 10000,
          });
          for (const tweet of data?.tweets || []) {
            const user = tweet.user || {};
            if (seen.has(user.id_str)) continue;
            seen.add(user.id_str);
            if (this.isBot(user)) continue;

            const score = this.scoreUser(user, address, ens);
            if (score < 30) continue; // only surface meaningful matches

            results.push({
              username:   user.screen_name,
              name:       user.name,
              followers:  user.followers_count,
              bio:        (user.description || '').slice(0, 150),
              score,
              tweetUrl:   `https://x.com/${user.screen_name}/status/${tweet.id_str}`,
              confidence: score >= 50 ? 'high' : 'possible',
            });
          }
        } catch (e) {
          this.logger.warn(`SocialData search failed for ${q}: ${e.message}`);
        }
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, 1); // only return the single best match
  }

  // ── Serper — web search ─────────────────────────────────────────────────────
  async searchWeb(address: string, ens: string | null): Promise<WebResult[]> {
    const key     = this.config.get('SERPER_API_KEY');
    const queries = ens ? [address, ens] : [address];
    const results: WebResult[] = [];

    for (const q of queries) {
      try {
        const { data } = await axios.post(
          'https://google.serper.dev/search',
          { q, num: 5 },
          { headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' }, timeout: 10000 },
        );
        for (const r of data?.organic || []) {
          results.push({ title: r.title, link: r.link, snippet: (r.snippet || '').slice(0, 150) });
        }
      } catch (e) {
        this.logger.warn(`Serper failed for ${q}: ${e.message}`);
      }
    }

    return results.slice(0, 6);
  }

  // ── Bot detection ───────────────────────────────────────────────────────────
  private isBot(user: any): boolean {
    const username  = (user.screen_name || '').toLowerCase();
    const followers = user.followers_count || 0;
    const following = user.friends_count  || 0;

    if (/[a-z]{2,6}\d{6,}/.test(username))           return true;
    if (followers === 0 && following === 0)            return true;
    if (followers < 50 && following > 1000)           return true;
    if (/bot$|alert$|scan$|tracker/.test(username))   return true;
    return false;
  }

  private scoreUser(user: any, address: string, ens?: string | null): number {
    let score = 0;
    const bio      = (user.description || '').toLowerCase();
    const username = (user.screen_name || '').toLowerCase();
    const name     = (user.name || '').toLowerCase();
    const addr     = address.toLowerCase();
    const ensName  = ens ? ens.toLowerCase().replace('.eth', '') : null;

    // Strong signals
    if (bio.includes(addr))                                  score += 60;
    if (bio.includes(addr.slice(0, 10)))                     score += 30;
    if (ensName && (bio.includes(ensName) || username.includes(ensName) || name.includes(ensName))) score += 40;

    // Follower credibility
    if (user.followers_count > 10000)      score += 20;
    else if (user.followers_count > 1000)  score += 12;
    else if (user.followers_count > 100)   score += 5;

    if (user.verified)                                        score += 15;
    if (user.profile_image_url && !user.default_profile_image) score += 5;

    return score;
  }
}
