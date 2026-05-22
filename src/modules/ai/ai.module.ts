import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiService } from './ai.service';
import { WorkflowGeneratorService } from './workflow-generator.service';
import { AiController } from './ai.controller';

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [AiController],
  providers: [AiService, WorkflowGeneratorService],
  exports: [AiService, WorkflowGeneratorService],
})
export class AiModule {}
