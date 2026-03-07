import { PrismaService } from '../../prisma/prisma.service';
export declare class CacheService {
    private prisma;
    constructor(prisma: PrismaService);
    get(address: string, mode?: string): Promise<object | null>;
    set(address: string, data: object, mode?: string): Promise<void>;
    invalidate(address: string, mode?: string): Promise<void>;
}
