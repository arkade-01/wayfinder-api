import { RateLimitService } from './ratelimit.service';
export declare class RateLimitController {
    private readonly rateLimitService;
    constructor(rateLimitService: RateLimitService);
    getLimits(req: any): Promise<{
        ip: string;
        limits: import("./ratelimit.service").ScanLimits;
    }>;
    private getClientIp;
    private maskIp;
}
