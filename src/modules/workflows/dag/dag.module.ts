import { Module } from '@nestjs/common';
import { DAGValidator } from './dag-validator';
import { DAGSorter } from './dag-sorter';
import { DAGExecutor } from './dag-executor';

@Module({
  providers: [DAGValidator, DAGSorter, DAGExecutor],
  exports: [DAGValidator, DAGSorter, DAGExecutor],
})
export class DAGModule {}
