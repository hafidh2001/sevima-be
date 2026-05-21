import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthCheckResult,
} from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './database.health';
import { Public } from '../../common/decorators/public.decorator';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private databaseHealth: DatabaseHealthIndicator,
  ) {}

  @Get()
  @Public()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([() => this.databaseHealth.isHealthy('database')]);
  }
}
