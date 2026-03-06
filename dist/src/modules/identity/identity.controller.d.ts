import { IdentityService } from './identity.service';
export declare class IdentityController {
    private readonly identityService;
    constructor(identityService: IdentityService);
    resolve(address: string): Promise<{
        address: string;
        identity: import("../../common/interfaces/wallet.interface").WalletIdentity;
        onchain: import("../../common/interfaces/wallet.interface").WalletOnchain;
        resolvedAt: string;
    }>;
}
