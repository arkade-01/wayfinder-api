export declare const WORMHOLE_CHAIN_MAP: Record<number, number>;
export declare const DEBRIDGE_CONTRACTS: Set<string>;
export declare const BRIDGE_CONTRACTS: Record<string, {
    name: string;
    dest: string;
}>;
export declare const TOKEN_CONTRACTS: Set<string>;
export declare const PHISHING_PATTERNS: string[];
export declare const CHAIN_NAMES: Record<number, string>;
export declare const CHAIN_IDS: Record<string, number>;
export declare const CACHE_TTL_HOURS = 24;
export declare const SCAN_QUEUE_NAME = "scan";
export declare const EXIT_TRACE_DEPTH = 2;
export declare const BATCH_CONCURRENCY = 5;
