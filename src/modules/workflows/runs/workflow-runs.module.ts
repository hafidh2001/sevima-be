import { Module, forwardRef } from '@nestjs/common';
import { WorkflowRunsController } from './workflow-runs.controller';
import { WebhooksController } from './workflow-runs.controller';
import { WorkflowRunsService } from './workflow-runs.service';
import { WorkflowRunsListener } from './workflow-runs.listener';
import { DAGModule } from '../dag/dag.module';

@Module({
  imports: [DAGModule],
  controllers: [WorkflowRunsController, WebhooksController],
  providers: [WorkflowRunsService, WorkflowRunsListener],
  exports: [WorkflowRunsService],
})
export class WorkflowRunsModule {}
