import { Module, forwardRef } from '@nestjs/common';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { DAGModule } from './dag/dag.module';
import { WorkflowRunsModule } from './runs/workflow-runs.module';

@Module({
  imports: [DAGModule, forwardRef(() => WorkflowRunsModule)],
  controllers: [WorkflowsController],
  providers: [WorkflowsService],
  exports: [WorkflowsService, DAGModule],
})
export class WorkflowsModule {}
