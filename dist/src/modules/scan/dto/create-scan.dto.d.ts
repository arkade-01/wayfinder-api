export declare enum ScanMode {
    QUICK = "quick",
    FULL = "full",
    BRIDGE = "bridge"
}
export declare class CreateScanDto {
    address: string;
    mode?: ScanMode;
}
