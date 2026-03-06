import { PrismaService } from '../../prisma/prisma.service';
export declare class CacheService {
    private prisma;
    constructor(prisma: PrismaService);
    get(address: string): Promise<object | null>;
    set(address: string, data: object): Promise<void>;
    invalidate(address: string): Promise<void>;
}
