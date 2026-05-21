import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_TENANT_INDEPENDENT } from '../decorators/tenant-independent.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class TenantIsolationGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Skip for public routes
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPublic) {
      return true;
    }

    const isIndependent = this.reflector.getAllAndOverride<boolean>(
      IS_TENANT_INDEPENDENT,
      [context.getHandler(), context.getClass()],
    );

    if (isIndependent) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const params = request.params;
    const body = request.body;

    if (!user || !user.tenantId) {
      throw new ForbiddenException('User not authenticated or missing tenant');
    }

    // Check if tenantId in params matches user's tenantId
    if (params.tenantId && parseInt(params.tenantId) !== user.tenantId) {
      throw new ForbiddenException('Access to other tenant data is forbidden');
    }

    // Check if tenantId in body matches user's tenantId
    if (body && body.tenantId && body.tenantId !== user.tenantId) {
      throw new ForbiddenException('Cannot create resources for other tenant');
    }

    // Attach tenantId to request for use in services
    request.tenantId = user.tenantId;

    return true;
  }
}
