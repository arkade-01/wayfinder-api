import { BridgeService } from './bridge.service';
import { RateLimitService } from '../ratelimit/ratelimit.service';
import { ExitWalletResult } from '../../common/interfaces/wallet.interface';
export declare class BridgeController {
    private readonly bridgeService;
    private readonly rateLimitService;
    constructor(bridgeService: BridgeService, rateLimitService: RateLimitService);
    trace(address: string, req: any, exitsParam?: string): Promise<{
        address: string;
        bridges: import("../../common/interfaces/wallet.interface").BridgeResult;
        exits: ExitWalletResult[];
        tracedAt: string;
        rateLimit: {
            type: string;
            remaining: number;
            limit: number;
        };
    }>;
    private getClientIp;
}
