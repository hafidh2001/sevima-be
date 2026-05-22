import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import CronExpression from 'cron-parser';

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private intervalId: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL = 60000; // 1 minute

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit() {
    this.logger.log('Starting workflow scheduler...');
    this.intervalId = setInterval(() => this.pollScheduledWorkflows(), this.POLL_INTERVAL);
    // Run immediately on startup
    this.pollScheduledWorkflows();
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.logger.log('Workflow scheduler stopped');
  }

  async pollScheduledWorkflows() {
    try {
      const workflows = await this.prisma.workflowDefinition.findMany({
        where: {
          status: 'ACTIVE',
          cronExpression: { not: null },
        },
        select: {
          id: true,
          name: true,
          tenantId: true,
          cronExpression: true,
          versions: {
            orderBy: { version: 'desc' },
            take: 1,
          },
        },
      });

      const now = new Date();

      for (const workflow of workflows) {
        if (!workflow.cronExpression || !workflow.versions[0]) continue;

        const isDue = this.isWorkflowDue(workflow.cronExpression, now);

        if (isDue) {
          this.logger.log(`Triggering scheduled workflow: ${workflow.name} (ID: ${workflow.id})`);

          // Create run record
          const run = await this.prisma.workflowRun.create({
            data: {
              workflowDefinitionId: workflow.id,
              workflowVersionId: workflow.versions[0].id,
              status: 'PENDING',
              startedAt: new Date(),
            },
          });

          // Emit event for async execution
          this.eventEmitter.emit('workflow.run', {
            runId: run.id,
            workflowId: workflow.id,
            definition: workflow.versions[0].definition,
            variables: {},
            userId: 0, // System user for scheduled runs
            tenantId: workflow.tenantId,
          });

          // Update last scheduled time (using a simple approach - in production use separate table)
          await this.prisma.workflowDefinition.update({
            where: { id: workflow.id },
            data: { updatedAt: now },
          });
        }
      }
    } catch (error) {
      this.logger.error(`Error polling scheduled workflows: ${error}`);
    }
  }

  private isWorkflowDue(cronExpression: string, now: Date): boolean {
    try {
      const expr = CronExpression.parse(cronExpression, { currentDate: now });
      const prevRun = expr.prev().toDate();

      // Check if the previous scheduled time is within the last poll interval
      const timeSinceLastRun = now.getTime() - prevRun.getTime();
      return timeSinceLastRun >= 0 && timeSinceLastRun <= this.POLL_INTERVAL;
    } catch (error) {
      this.logger.warn(`Invalid cron expression: ${cronExpression} - ${error}`);
      return false;
    }
  }
}
