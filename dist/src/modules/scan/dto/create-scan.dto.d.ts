export declare enum ScanMode {
    QUICK = "quick",
    FULL = "full"
}
export declare class CreateScanDto {
    address: string;
    mode?: ScanMode;
}
