import { ConfigService } from '@nestjs/config';
import { BridgeResult, BridgeTransfer, ExitWalletResult } from '../../common/interfaces/wallet.interface';
import { IdentityService } from '../identity/identity.service';
export declare class BridgeService {
    private config;
    private identity;
    private readonly logger;
    constructor(config: ConfigService, identity: IdentityService);
    trace(address: string): Promise<BridgeResult>;
    private getRelayTransfers;
    private parseRelayTx;
    private getLifiTransfers;
    private parseLifiTx;
    private getOfficialBridgeTxs;
    private getWormholeTransfers;
    private getDeBridgeTransfers;
    traceExits(crossWalletTxs: BridgeTransfer[], maxDepth: number, depth?: number): Promise<ExitWalletResult[]>;
    private chainName;
    private isCrossWallet;
    private checkIsContract;
}
