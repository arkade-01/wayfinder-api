import { Module, Global } from '@nestjs/common';
import { RateLimitService } from './ratelimit.service';
import { RateLimitController } from './ratelimit.controller';

@Global()
@Module({
  providers: [RateLimitService],
  controllers: [RateLimitController],
  exports: [RateLimitService],
})
export class RateLimitModule {}
