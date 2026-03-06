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
var BridgeService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BridgeService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const bridges_1 = require("../../common/constants/bridges");
const identity_service_1 = require("../identity/identity.service");
let BridgeService = BridgeService_1 = class BridgeService {
    config;
    identity;
    logger = new common_1.Logger(BridgeService_1.name);
    constructor(config, identity) {
        this.config = config;
        this.identity = identity;
    }
    async trace(address) {
        const [relayTransfers, lifiTransfers, officialTransfers, wormholeTransfers, debridgeTransfers] = await Promise.all([
            this.getRelayTransfers(address),
            this.getLifiTransfers(address),
            this.getOfficialBridgeTxs(address),
            this.getWormholeTransfers(address),
            this.getDeBridgeTransfers(address),
        ]);
        const all = [
            ...relayTransfers,
            ...lifiTransfers,
            ...officialTransfers,
            ...wormholeTransfers,
            ...debridgeTransfers,
        ];
        const seen = new Set();
        const unique = all.filter((t) => {
            const key = t.originTx || `${t.bridge}-${t.date}-${t.amount}`;
            if (seen.has(key))
                return false;
            seen.add(key);
            return true;
        });
        const totalUsd = unique.reduce((s, t) => s + (parseFloat(t.amountUsd) || 0), 0);
        const bridges = [...new Set(unique.map((t) => t.bridge))];
        const destChains = [...new Set(unique.map((t) => t.destChain).filter(Boolean))];
        return {
            totalBridgedUsd: Math.round(totalUsd * 100) / 100,
            bridgesUsed: bridges,
            destChains,
            transfers: unique,
        };
    }
    async getRelayTransfers(address) {
        const results = [];
        let continuation = null;
        while (true) {
            try {
                const params = { user: address, limit: 50 };
                if (continuation)
                    params.continuation = continuation;
                const { data } = await axios_1.default.get('https://api.relay.link/requests/v2', {
                    params, timeout: 15000,
                });
                for (const tx of data?.requests || []) {
                    if (tx.status !== 'success')
                        continue;
                    results.push(this.parseRelayTx(tx, address));
                }
                continuation = data?.continuation || null;
                if (!continuation || (data?.requests?.length || 0) < 50)
                    break;
            }
            catch (e) {
                this.logger.warn(`Relay failed for ${address}: ${e.message}`);
                break;
            }
        }
        return results;
    }
    parseRelayTx(tx, address) {
        const meta = tx?.data?.metadata || {};
        const inTxs = tx?.data?.inTxs || [];
        const outTxs = tx?.data?.outTxs || [];
        const inTx = inTxs[0] || {};
        const outTx = outTxs[0] || {};
        const sender = (inTx?.data?.from || tx.user || '').toLowerCase();
        const recipient = (outTx?.data?.to || tx.recipient || '').toLowerCase();
        const amtIn = meta?.currencyIn || {};
        const amtOut = meta?.currencyOut || {};
        return {
            source: 'relay',
            bridge: 'Relay.link',
            status: tx.status,
            date: (tx.createdAt || '').slice(0, 10),
            originChain: this.chainName(inTx?.chainId),
            originChainId: inTx?.chainId || null,
            destChain: this.chainName(outTx?.chainId),
            destChainId: outTx?.chainId || null,
            sender,
            recipient,
            crossWallet: this.isCrossWallet(sender, recipient),
            token: amtIn?.currency?.symbol || '?',
            amount: amtIn?.amountFormatted || '?',
            amountUsd: amtIn?.amountUsd || '0',
            originTx: inTx?.hash || '',
            destTx: outTx?.hash || '',
        };
    }
    async getLifiTransfers(address) {
        try {
            const { data } = await axios_1.default.get('https://li.quest/v1/analytics/transfers', {
                params: { wallet: address, status: 'ALL' },
                timeout: 15000,
            });
            return (data?.transfers || []).map((tx) => this.parseLifiTx(tx, address));
        }
        catch (e) {
            this.logger.warn(`LI.FI failed for ${address}: ${e.message}`);
            return [];
        }
    }
    parseLifiTx(tx, address) {
        const sending = tx?.sending || {};
        const receiving = tx?.receiving || {};
        const sender = (sending?.fromAddress || address).toLowerCase();
        const recipient = (receiving?.toAddress || sender).toLowerCase();
        const ts = sending?.timestamp;
        const date = ts ? new Date(ts * 1000).toISOString().slice(0, 10) : '';
        return {
            source: 'lifi',
            bridge: tx.bridge || 'LI.FI',
            status: tx.status,
            date,
            originChain: this.chainName(sending?.chainId),
            originChainId: sending?.chainId || null,
            destChain: this.chainName(receiving?.chainId),
            destChainId: receiving?.chainId || null,
            sender,
            recipient,
            crossWallet: this.isCrossWallet(sender, recipient),
            token: sending?.token?.symbol || '?',
            amount: sending?.amount || '?',
            amountUsd: sending?.amountUSD || '0',
            originTx: sending?.txHash || '',
            destTx: receiving?.txHash || '',
        };
    }
    async getOfficialBridgeTxs(address) {
        const key = this.config.get('ETHERSCAN_API_KEY');
        try {
            const { data } = await axios_1.default.get('https://api.etherscan.io/v2/api', {
                params: {
                    chainid: 1, module: 'account', action: 'txlist',
                    address, sort: 'desc', apikey: key,
                },
                timeout: 15000,
            });
            const txs = data?.status === '1' ? data.result : [];
            const results = [];
            for (const tx of txs) {
                const to = (tx.to || '').toLowerCase();
                if (!bridges_1.BRIDGE_CONTRACTS[to])
                    continue;
                const { name, dest } = bridges_1.BRIDGE_CONTRACTS[to];
                if (dest === 'multi')
                    continue;
                const valueEth = parseInt(tx.value || '0') / 1e18;
                if (valueEth < 0.001)
                    continue;
                const destChainIds = {
                    base: 8453, optimism: 10, arbitrum: 42161, polygon: 137,
                };
                results.push({
                    source: 'etherscan',
                    bridge: name,
                    status: tx.isError === '0' ? 'success' : 'failed',
                    date: new Date(parseInt(tx.timeStamp) * 1000).toISOString().slice(0, 10),
                    originChain: 'Ethereum',
                    originChainId: 1,
                    destChain: dest.charAt(0).toUpperCase() + dest.slice(1),
                    destChainId: destChainIds[dest] || null,
                    sender: address.toLowerCase(),
                    recipient: address.toLowerCase(),
                    crossWallet: false,
                    token: 'ETH',
                    amount: valueEth.toFixed(4),
                    amountUsd: '0',
                    originTx: tx.hash,
                    destTx: '',
                });
            }
            return results;
        }
        catch (e) {
            this.logger.warn(`Etherscan bridge scan failed for ${address}: ${e.message}`);
            return [];
        }
    }
    async getWormholeTransfers(address) {
        const results = [];
        let page = 0;
        while (page < 5) {
            try {
                const { data } = await axios_1.default.get('https://api.wormholescan.io/api/v1/operations', {
                    params: { address, page, pageSize: 50 },
                    timeout: 15000,
                });
                const ops = data?.operations || [];
                if (!ops.length)
                    break;
                for (const op of ops) {
                    const src = op.sourceChain || {};
                    const dst = op.targetChain || {};
                    const props = op.content?.standarizedProperties || {};
                    const sender = (src.from || '').toLowerCase();
                    const recipient = (props.toAddress || dst.to || '').toLowerCase();
                    const srcChainId = bridges_1.WORMHOLE_CHAIN_MAP[props.fromChain || src.chainId] || null;
                    const dstChainId = bridges_1.WORMHOLE_CHAIN_MAP[props.toChain || dst.chainId] || null;
                    results.push({
                        source: 'wormhole',
                        bridge: 'Wormhole',
                        status: dst.status || 'unknown',
                        date: (src.timestamp || '').slice(0, 10),
                        originChain: this.chainName(srcChainId || src.chainId),
                        originChainId: srcChainId,
                        destChain: this.chainName(dstChainId || dst.chainId),
                        destChainId: dstChainId,
                        sender,
                        recipient,
                        crossWallet: this.isCrossWallet(sender, recipient),
                        token: props.tokenAddress ? 'TOKEN' : '?',
                        amount: props.amount || '?',
                        amountUsd: '0',
                        originTx: src.transaction?.txHash || '',
                        destTx: dst.transaction?.txHash || '',
                    });
                }
                if (ops.length < 50)
                    break;
                page++;
            }
            catch (e) {
                this.logger.warn(`Wormhole failed for ${address}: ${e.message}`);
                break;
            }
        }
        return results;
    }
    async getDeBridgeTransfers(address) {
        const key = this.config.get('ETHERSCAN_API_KEY');
        const results = [];
        const chains = [
            { id: 1, name: 'Ethereum' },
            { id: 42161, name: 'Arbitrum' },
            { id: 137, name: 'Polygon' },
            { id: 56, name: 'BSC' },
            { id: 10, name: 'Optimism' },
            { id: 8453, name: 'Base' },
        ];
        for (const chain of chains) {
            try {
                const { data } = await axios_1.default.get('https://api.etherscan.io/v2/api', {
                    params: {
                        chainid: chain.id, module: 'account', action: 'txlist',
                        address, sort: 'desc', apikey: key,
                    },
                    timeout: 10000,
                });
                const txs = data?.status === '1' ? data.result : [];
                for (const tx of txs) {
                    const to = (tx.to || '').toLowerCase();
                    if (!bridges_1.DEBRIDGE_CONTRACTS.has(to))
                        continue;
                    const valueEth = parseInt(tx.value || '0') / 1e18;
                    results.push({
                        source: 'debridge',
                        bridge: 'deBridge',
                        status: tx.isError === '0' ? 'success' : 'failed',
                        date: new Date(parseInt(tx.timeStamp) * 1000).toISOString().slice(0, 10),
                        originChain: chain.name,
                        originChainId: chain.id,
                        destChain: 'Unknown',
                        destChainId: null,
                        sender: address.toLowerCase(),
                        recipient: address.toLowerCase(),
                        crossWallet: false,
                        token: valueEth > 0 ? 'ETH' : 'TOKEN',
                        amount: valueEth > 0 ? valueEth.toFixed(4) : '?',
                        amountUsd: '0',
                        originTx: tx.hash,
                        destTx: '',
                    });
                }
            }
            catch (e) {
                this.logger.warn(`deBridge scan failed on chain ${chain.id}: ${e.message}`);
            }
        }
        return results;
    }
    async traceExits(crossWalletTxs, maxDepth, depth = 0) {
        if (depth >= maxDepth)
            return [];
        const realExits = crossWalletTxs.filter((t) => t.recipient.startsWith('0x') &&
            !bridges_1.TOKEN_CONTRACTS.has(t.recipient) &&
            !t.recipient.startsWith('0x000000'));
        const unique = new Map();
        for (const t of realExits) {
            if (!unique.has(t.recipient))
                unique.set(t.recipient, t);
        }
        const exits = [];
        for (const [recipient, tx] of unique) {
            try {
                const [exitIdentity, relayTxs, isContract] = await Promise.all([
                    this.identity.resolve(recipient),
                    this.getRelayTransfers(recipient),
                    this.checkIsContract(recipient),
                ]);
                if (isContract)
                    continue;
                const furtherCrossWallet = relayTxs.filter((t) => t.crossWallet);
                const furtherExits = furtherCrossWallet.slice(0, 3).map((t) => ({
                    recipient: t.recipient,
                    amount: t.amount,
                    token: t.token,
                    fromChain: t.originChainId || t.originChain,
                    toChain: t.destChainId || t.destChain,
                }));
                exits.push({
                    address: recipient,
                    chain: tx.destChain,
                    identity: exitIdentity,
                    amountUsd: tx.amountUsd,
                    relayTxCount: relayTxs.length,
                    bridgesFurther: furtherExits.length > 0,
                    isContract: false,
                    furtherExits,
                });
            }
            catch (e) {
                this.logger.warn(`Exit trace failed for ${recipient}: ${e.message}`);
            }
        }
        return exits;
    }
    chainName(chainId) {
        if (!chainId)
            return 'Unknown';
        return bridges_1.CHAIN_NAMES[chainId] || `Chain-${chainId}`;
    }
    isCrossWallet(sender, recipient) {
        return (!!sender &&
            !!recipient &&
            sender !== recipient &&
            !bridges_1.TOKEN_CONTRACTS.has(recipient) &&
            recipient.startsWith('0x'));
    }
    async checkIsContract(address) {
        const key = this.config.get('ETHERSCAN_API_KEY');
        try {
            const { data } = await axios_1.default.get('https://api.etherscan.io/v2/api', {
                params: {
                    chainid: 1, module: 'contract',
                    action: 'getabi', address, apikey: key,
                },
                timeout: 8000,
            });
            return data?.status === '1';
        }
        catch {
            return false;
        }
    }
};
exports.BridgeService = BridgeService;
exports.BridgeService = BridgeService = BridgeService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        identity_service_1.IdentityService])
], BridgeService);
//# sourceMappingURL=bridge.service.js.map