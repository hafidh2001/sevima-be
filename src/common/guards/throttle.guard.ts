import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';
import { ThrottlerLimitDetail } from '@nestjs/throttler/dist/throttler.guard.interface';
import { Request } from 'express';

@Injectable()
export class TenantThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    // Use tenant ID as the tracker for per-tenant rate limiting
    const tenantId = (req as any).user?.tenantId;
    if (tenantId) {
      return `tenant:${tenantId}`;
    }
    // Fall back to IP if no tenant
    return req.ip || req.socket.remoteAddress || 'unknown';
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const response = context.switchToHttp().getResponse();
    const retryAfterSeconds = Math.ceil(throttlerLimitDetail.timeToExpire / 1000);
    response.setHeader('Retry-After', retryAfterSeconds);
    throw new ThrottlerException('Too many requests');
  }
}
