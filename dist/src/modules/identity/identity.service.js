"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var IdentityService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdentityService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
let IdentityService = IdentityService_1 = class IdentityService {
    config;
    logger = new common_1.Logger(IdentityService_1.name);
    constructor(config) {
        this.config = config;
    }
    async resolve(address) {
        const result = {
            ens: null, twitter: null, lens: null,
            farcaster: null, web: [], xResults: [],
        };
        try {
            const { data } = await axios_1.default.get(`https://api.web3.bio/profile/${address}`, { timeout: 10000 });
            const profiles = Array.isArray(data) ? data : [];
            for (const p of profiles) {
                const plt = (p.platform || '').toLowerCase();
                if (plt === 'ens')
                    result.ens = p.identity;
                if (plt === 'twitter')
                    result.twitter = p.identity;
                if (plt === 'lens')
                    result.lens = p.identity;
                if (plt === 'farcaster')
                    result.farcaster = p.identity;
            }
        }
        catch (e) {
            this.logger.warn(`web3.bio failed for ${address}: ${e.message}`);
        }
        if (!result.ens) {
            try {
                const { data } = await axios_1.default.get(`https://api.ensideas.com/ens/resolve/${address}`, { timeout: 8000 });
                if (data?.name && !data.name.startsWith('0x')) {
                    result.ens = data.name;
                }
            }
            catch (e) {
                this.logger.warn(`ENSideas fallback failed for ${address}: ${e.message}`);
            }
        }
        return result;
    }
    async getOnchain(address) {
        const key = this.config.get('ETHERSCAN_API_KEY');
        const base = 'https://api.etherscan.io/v2/api';
        const chainid = 1;
        const [balRes, txRes, tokRes, nftRes] = await Promise.allSettled([
            axios_1.default.get(base, { params: { chainid, module: 'account', action: 'balance', address, apikey: key }, timeout: 10000 }),
            axios_1.default.get(base, { params: { chainid, module: 'account', action: 'txlist', address, sort: 'desc', page: 1, offset: 20, apikey: key }, timeout: 10000 }),
            axios_1.default.get(base, { params: { chainid, module: 'account', action: 'tokentx', address, sort: 'desc', page: 1, offset: 50, apikey: key }, timeout: 10000 }),
            axios_1.default.get(base, { params: { chainid, module: 'account', action: 'tokennfttx', address, sort: 'desc', page: 1, offset: 20, apikey: key }, timeout: 10000 }),
        ]);
        const balEth = balRes.status === 'fulfilled' && balRes.value.data.status === '1'
            ? parseInt(balRes.value.data.result) / 1e18 : 0;
        const txs = txRes.status === 'fulfilled' && txRes.value.data.status === '1'
            ? txRes.value.data.result : [];
        const tokenTxs = tokRes.status === 'fulfilled' && tokRes.value.data.status === '1'
            ? tokRes.value.data.result : [];
        const nftTxs = nftRes.status === 'fulfilled' && nftRes.value.data.status === '1'
            ? nftRes.value.data.result : [];
        const tokens = [...new Set(tokenTxs.map((t) => t.tokenSymbol).filter(Boolean))];
        const nfts = [...new Set(nftTxs.map((t) => t.tokenName).filter(Boolean))];
        const contacts = txs
            .flatMap((t) => [t.from?.toLowerCase(), t.to?.toLowerCase()])
            .filter((a) => a && a !== address.toLowerCase());
        const topContacts = [...new Set(contacts)].slice(0, 5);
        const lastTx = txs[0]?.timeStamp
            ? new Date(parseInt(txs[0].timeStamp) * 1000).toISOString().slice(0, 10)
            : null;
        return {
            balanceEth: balEth,
            balanceUsd: 0,
            txCount: txs.length,
            lastActive: lastTx || '',
            tokens: tokens.slice(0, 10),
            nfts: nfts.slice(0, 10),
            topContacts,
        };
    }
    async searchX(address, ens) {
        const key = this.config.get('SOCIALDATA_API_KEY');
        const headers = { Authorization: `Bearer ${key}`, Accept: 'application/json' };
        const queries = [address];
        if (ens) {
            queries.push(ens);
            queries.push(ens.replace('.eth', ''));
        }
        const results = [];
        const seen = new Set();
        for (const q of queries) {
            try {
                const { data } = await axios_1.default.get('https://api.socialdata.tools/twitter/search', {
                    headers,
                    params: { query: q, type: 'Latest' },
                    timeout: 10000,
                });
                for (const tweet of data?.tweets || []) {
                    const user = tweet.user || {};
                    if (seen.has(user.id_str))
                        continue;
                    seen.add(user.id_str);
                    if (this.isBot(user))
                        continue;
                    results.push({
                        username: user.screen_name,
                        name: user.name,
                        followers: user.followers_count,
                        bio: (user.description || '').slice(0, 150),
                        score: this.scoreUser(user, address, ens),
                        tweetUrl: `https://x.com/${user.screen_name}/status/${tweet.id_str}`,
                    });
                }
            }
            catch (e) {
                this.logger.warn(`SocialData failed for ${q}: ${e.message}`);
            }
        }
        return results
            .filter((r) => r.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);
    }
    async searchWeb(address, ens) {
        const key = this.config.get('SERPER_API_KEY');
        const queries = ens ? [address, ens] : [address];
        const results = [];
        for (const q of queries) {
            try {
                const { data } = await axios_1.default.post('https://google.serper.dev/search', { q, num: 5 }, { headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' }, timeout: 10000 });
                for (const r of data?.organic || []) {
                    results.push({ title: r.title, link: r.link, snippet: (r.snippet || '').slice(0, 150) });
                }
            }
            catch (e) {
                this.logger.warn(`Serper failed for ${q}: ${e.message}`);
            }
        }
        return results.slice(0, 6);
    }
    isBot(user) {
        const username = (user.screen_name || '').toLowerCase();
        const followers = user.followers_count || 0;
        const following = user.friends_count || 0;
        if (/[a-z]{2,6}\d{6,}/.test(username))
            return true;
        if (followers === 0 && following === 0)
            return true;
        if (followers < 50 && following > 1000)
            return true;
        if (/bot$|alert$|scan$|tracker/.test(username))
            return true;
        return false;
    }
    scoreUser(user, address, ens) {
        let score = 0;
        const bio = (user.description || '').toLowerCase();
        const username = (user.screen_name || '').toLowerCase();
        const name = (user.name || '').toLowerCase();
        const addr = address.toLowerCase();
        const ensName = ens ? ens.toLowerCase().replace('.eth', '') : null;
        if (bio.includes(addr))
            score += 60;
        if (bio.includes(addr.slice(0, 10)))
            score += 30;
        if (ensName && (bio.includes(ensName) || username.includes(ensName) || name.includes(ensName)))
            score += 40;
        if (user.followers_count > 10000)
            score += 20;
        else if (user.followers_count > 1000)
            score += 12;
        else if (user.followers_count > 100)
            score += 5;
        if (user.verified)
            score += 15;
        if (user.profile_image_url && !user.default_profile_image)
            score += 5;
        return score;
    }
};
exports.IdentityService = IdentityService;
exports.IdentityService = IdentityService = IdentityService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], IdentityService);
//# sourceMappingURL=identity.service.js.map