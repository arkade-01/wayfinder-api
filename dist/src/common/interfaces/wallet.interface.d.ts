export interface WalletIdentity {
    ens: string | null;
    twitter: string | null;
    lens: string | null;
    farcaster: string | null;
    web: WebResult[];
    xResults: XResult[];
}
export interface WebResult {
    title: string;
    link: string;
    snippet: string;
}
export interface XResult {
    username: string;
    name: string;
    followers: number;
    bio: string;
    score: number;
    tweetUrl: string;
    confidence: 'confirmed' | 'high' | 'possible';
}
export interface WalletOnchain {
    balanceEth: number;
    balanceUsd: number;
    txCount: number;
    lastActive: string;
    tokens: string[];
    nfts: string[];
    topContacts: string[];
}
export interface BridgeTransfer {
    source: 'relay' | 'lifi' | 'etherscan';
    bridge: string;
    status: string;
    date: string;
    originChain: string;
    originChainId: number | null;
    destChain: string;
    destChainId: number | null;
    sender: string;
    recipient: string;
    crossWallet: boolean;
    token: string;
    amount: string;
    amountUsd: string;
    originTx: string;
    destTx: string;
}
export interface BridgeResult {
    totalBridgedUsd: number;
    bridgesUsed: string[];
    destChains: string[];
    transfers: BridgeTransfer[];
}
export interface ExitWalletResult {
    address: string;
    chain: string;
    identity: Partial<WalletIdentity>;
    amountUsd: string;
    relayTxCount: number;
    bridgesFurther: boolean;
    isContract: boolean;
    furtherExits: FurtherExit[];
}
export interface FurtherExit {
    recipient: string;
    amount: string;
    token: string;
    fromChain: number | string;
    toChain: number | string;
}
export interface RiskFlags {
    crossWalletExits: number;
    unknownExits: number;
    phishingContact: boolean;
    mixerContact: boolean;
    highValueBridge: boolean;
}
export interface ScanResult {
    scanId: string;
    address: string;
    identity: WalletIdentity;
    onchain: WalletOnchain;
    bridges: BridgeResult;
    exits: ExitWalletResult[];
    risk: RiskFlags;
    cachedAt: string;
}
