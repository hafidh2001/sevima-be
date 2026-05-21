import { Module } from '@nestjs/common';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { DAGModule } from './dag/dag.module';

@Module({
  imports: [DAGModule],
  controllers: [WorkflowsController],
  providers: [WorkflowsService],
  exports: [WorkflowsService, DAGModule],
})
export class WorkflowsModule {}
