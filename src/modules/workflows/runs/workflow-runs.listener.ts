import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../database/prisma.service';
import { DAGExecutor } from '../dag/dag-executor';
import { SseService } from '../../sse/sse.service';
import { StepLogService } from '../logs/step-log.service';
import { ExecutionContext, WorkflowTimeoutError } from '../dag/dag.types';
import { RunStatus, StepStatus, LogLevel } from '@prisma/client';

interface WorkflowRunEvent {
  runId: number;
  workflowId: number;
  definition: any;
  variables: Record<string, any>;
  userId: number;
  tenantId: number;
}

interface StepEventPayload {
  runId: number;
  stepId: string;
  status: StepStatus;
  output?: any;
  error?: string;
  retryCount?: number;
}

@Injectable()
export class WorkflowRunsListener {
  private readonly logger = new Logger(WorkflowRunsListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dagExecutor: DAGExecutor,
    private readonly sseService: SseService,
    private readonly stepLogService: StepLogService,
  ) {}

  @OnEvent('workflow.run')
  async handleWorkflowRun(event: WorkflowRunEvent) {
    const { runId, definition, variables, userId, tenantId } = event;

    this.logger.log(`Starting workflow execution for run ${runId}`);

    try {
      // Update status to RUNNING
      await this.prisma.workflowRun.update({
        where: { id: runId },
        data: { status: RunStatus.RUNNING },
      });

      // Create step run records
      for (const node of definition.nodes) {
        const stepRun = await this.prisma.stepRun.create({
          data: {
            workflowRunId: runId,
            stepId: node.id,
            stepName: node.name,
            stepType: node.type.toUpperCase() as any,
            status: StepStatus.PENDING,
            retryCount: 0,
            maxRetries: node.retryConfig?.maxRetries || 3,
          },
        });

        // Log step creation
        await this.stepLogService.log({
          stepRunId: stepRun.id,
          level: LogLevel.INFO,
          message: `Step "${node.name}" (${node.type}) initialized with ${node.retryConfig?.maxRetries || 3} max retries`,
          metadata: { nodeId: node.id, maxRetries: node.retryConfig?.maxRetries || 3 },
        });
      }

      // Execute the workflow
      const context: ExecutionContext = {
        workflowRunId: runId,
        tenantId,
        userId,
        variables,
        results: new Map(),
        startTime: new Date(),
      };

      await this.dagExecutor.execute(runId, definition, context);

      // Check if all steps succeeded
      const stepRuns = await this.prisma.stepRun.findMany({
        where: { workflowRunId: runId },
      });

      const allSuccess = stepRuns.every((step) => step.status === StepStatus.SUCCESS);
      const anyFailed = stepRuns.some((step) => step.status === StepStatus.FAILED);

      await this.prisma.workflowRun.update({
        where: { id: runId },
        data: {
          status: allSuccess ? RunStatus.SUCCESS : anyFailed ? RunStatus.FAILED : RunStatus.RUNNING,
          completedAt: new Date(),
        },
      });

      this.logger.log(`Workflow run ${runId} completed with status: ${allSuccess ? 'SUCCESS' : 'FAILED'}`);
    } catch (error) {
      if (error instanceof WorkflowTimeoutError) {
        this.logger.error(`Workflow run ${runId} timed out after ${error.elapsed}ms`);

        // Cancel all running steps
        await this.prisma.stepRun.updateMany({
          where: {
            workflowRunId: runId,
            status: { in: [StepStatus.PENDING, StepStatus.RUNNING] },
          },
          data: {
            status: StepStatus.FAILED,
            error: 'Workflow timeout exceeded',
            completedAt: new Date(),
          },
        });

        await this.prisma.workflowRun.update({
          where: { id: runId },
          data: {
            status: RunStatus.TIMED_OUT,
            completedAt: new Date(),
          },
        });
      } else {
        this.logger.error(`Workflow run ${runId} failed: ${error}`);

        await this.prisma.workflowRun.update({
          where: { id: runId },
          data: {
            status: RunStatus.FAILED,
            completedAt: new Date(),
          },
        });
      }
    }
  }

  @OnEvent('step.update', { async: true })
  async handleStepUpdate(payload: StepEventPayload) {
    const { runId, stepId, status, output, error, retryCount } = payload;

    // Broadcast to SSE subscribers
    this.sseService.broadcastStepEvent({
      runId,
      stepId,
      status,
      timestamp: new Date(),
      output,
      error,
      retryCount,
    });

    // Find stepRun for logging
    const stepRun = await this.prisma.stepRun.findFirst({
      where: { workflowRunId: runId, stepId },
    });

    if (stepRun) {
      const logLevel = status === StepStatus.FAILED ? LogLevel.ERROR : LogLevel.INFO;
      let logMessage = `Step "${stepRun.stepName}" ${status.toLowerCase()}`;

      if (status === StepStatus.RUNNING) {
        logMessage = `Step "${stepRun.stepName}" started (retry: ${retryCount || 0})`;
      } else if (status === StepStatus.FAILED) {
        logMessage = `Step "${stepRun.stepName}" failed: ${error}`;
      } else if (status === StepStatus.SUCCESS) {
        logMessage = `Step "${stepRun.stepName}" completed successfully`;
      }

      await this.stepLogService.log({
        stepRunId: stepRun.id,
        level: logLevel,
        message: logMessage,
        metadata: {
          status,
          output: status === StepStatus.SUCCESS ? output : undefined,
          error: status === StepStatus.FAILED ? error : undefined,
          retryCount,
        },
      });
    }

    this.logger.debug(`Step ${stepId} in run ${runId} updated to ${status}`);
  }
}
