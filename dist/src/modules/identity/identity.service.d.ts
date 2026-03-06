import { ConfigService } from '@nestjs/config';
import { WalletIdentity, WalletOnchain, XResult, WebResult } from '../../common/interfaces/wallet.interface';
export declare class IdentityService {
    private config;
    private readonly logger;
    constructor(config: ConfigService);
    resolve(address: string): Promise<WalletIdentity>;
    getOnchain(address: string): Promise<WalletOnchain>;
    searchX(address: string, ens: string | null): Promise<XResult[]>;
    searchWeb(address: string, ens: string | null): Promise<WebResult[]>;
    private isBot;
    private scoreUser;
}
