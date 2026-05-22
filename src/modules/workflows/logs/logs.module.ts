import { Module, Global } from '@nestjs/common';
import { StepLogService } from './step-log.service';
import { DatabaseModule } from '../../../database/database.module';

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [StepLogService],
  exports: [StepLogService],
})
export class LogsModule {}
