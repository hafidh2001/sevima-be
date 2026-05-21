import { SetMetadata } from '@nestjs/common';

export const IS_TENANT_INDEPENDENT = 'isTenantIndependent';
export const TenantIndependent = () => SetMetadata(IS_TENANT_INDEPENDENT, true);
