import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD } from '@nestjs/core';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { SseModule } from './modules/sse/sse.module';
import { DatabaseModule } from './database/database.module';
import { RolesGuard } from './common/guards/roles.guard';
import { TenantIsolationGuard } from './common/guards/tenant-isolation.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    EventEmitterModule.forRoot({}),
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.THROTTLE_TTL) || 60000,
        limit: Number(process.env.THROTTLE_LIMIT) || 100,
      },
    ]),
    DatabaseModule,
    HealthModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    WorkflowsModule,
    SchedulerModule,
    SseModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: TenantIsolationGuard,
    },
  ],
})
export class AppModule {}
