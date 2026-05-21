import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { RootController } from './root.controller';
import { DatabaseHealthIndicator } from './database.health';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController, RootController],
  providers: [DatabaseHealthIndicator],
})
export class HealthModule {}
