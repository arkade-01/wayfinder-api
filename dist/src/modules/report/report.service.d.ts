import { ScanResult } from '../../common/interfaces/wallet.interface';
export declare class ReportService {
    private readonly logger;
    generatePdf(result: ScanResult): Promise<Buffer>;
    private buildHtml;
    private riskScore;
}
