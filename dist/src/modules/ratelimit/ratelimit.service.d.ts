export interface ScanLimits {
    quick: {
        used: number;
        limit: number;
        resetsAt: string;
    };
    full: {
        used: number;
        limit: number;
        resetsAt: string;
    };
    bridge: {
        used: number;
        limit: number;
        resetsAt: string;
    };
    bulk: {
        used: number;
        limit: number;
        resetsAt: string;
    };
}
export declare class RateLimitService {
    private readonly logger;
    private redis;
    constructor();
    private getKey;
    private getResetTime;
    checkLimit(ip: string, scanType: 'quick' | 'full' | 'bridge' | 'bulk'): Promise<{
        allowed: boolean;
        remaining: number;
        limit: number;
    }>;
    increment(ip: string, scanType: 'quick' | 'full' | 'bridge' | 'bulk'): Promise<void>;
    getLimits(ip: string): Promise<ScanLimits>;
}
