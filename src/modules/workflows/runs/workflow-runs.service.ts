import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { DAGExecutor } from '../dag/dag-executor';
import { DAGValidator } from '../dag/dag-validator';
import { CreateWorkflowRunDto, QueryWorkflowRunDto } from './dto/create-workflow-run.dto';
import { WebhookTriggerDto } from './dto/webhook-trigger.dto';
import { RunStatus, StepStatus, Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class WorkflowRunsService {
  private readonly logger = new Logger(WorkflowRunsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dagExecutor: DAGExecutor,
    private readonly dagValidator: DAGValidator,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async trigger(
    workflowId: number,
    userId: number,
    tenantId: number,
    dto: CreateWorkflowRunDto,
  ) {
    // Get workflow definition with version
    const workflow = await this.prisma.workflowDefinition.findFirst({
      where: { id: workflowId, tenantId },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          where: dto.version ? { version: dto.version } : undefined,
        },
      },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow with ID ${workflowId} not found`);
    }

    if (!workflow.isActive) {
      throw new BadRequestException('Workflow is not active');
    }

    const versionToRun = workflow.versions[0];
    if (!versionToRun) {
      throw new BadRequestException('No workflow version found');
    }

    // Validate the workflow definition
    const definition = versionToRun.definition as any;
    const validation = this.dagValidator.validate(definition);
    if (!validation.isValid) {
      throw new BadRequestException(
        `Invalid workflow definition: ${validation.errors.map((e) => e.message).join(', ')}`,
      );
    }

    // Create workflow run record
    const run = await this.prisma.workflowRun.create({
      data: {
        workflowDefinitionId: workflow.id,
        workflowVersionId: versionToRun.id,
        status: RunStatus.PENDING,
        startedAt: new Date(),
      },
    });

    // Emit event for async execution
    this.eventEmitter.emit('workflow.run', {
      runId: run.id,
      workflowId: workflow.id,
      definition,
      variables: dto.variables || {},
      userId,
      tenantId,
    });

    // Return run info immediately
    return {
      runId: run.id,
      workflowId: workflow.id,
      version: versionToRun.version,
      status: run.status,
      message: 'Workflow triggered successfully',
    };
  }

  async triggerWebhook(
    token: string,
    dto: WebhookTriggerDto,
    idempotencyKey?: string,
  ) {
    // Find workflow by webhook token
    const workflow = await this.prisma.workflowDefinition.findFirst({
      where: { webhookToken: token },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow not found`);
    }

    if (!workflow.isActive) {
      throw new BadRequestException('Workflow is not active');
    }

    const versionToRun = workflow.versions[0];
    if (!versionToRun) {
      throw new BadRequestException('No workflow version found');
    }

    // Check idempotency - if same idempotencyKey exists for this workflow, return existing run
    if (idempotencyKey) {
      const existingRun = await this.prisma.workflowRun.findFirst({
        where: {
          workflowDefinitionId: workflow.id,
          idempotencyKey,
        },
      });

      if (existingRun) {
        return {
          runId: existingRun.id,
          workflowId: workflow.id,
          status: existingRun.status,
          message: 'Duplicate request - returning existing run',
          isDuplicate: true,
        };
      }
    }

    // Create workflow run
    const run = await this.prisma.workflowRun.create({
      data: {
        workflowDefinitionId: workflow.id,
        workflowVersionId: versionToRun.id,
        status: RunStatus.PENDING,
        startedAt: new Date(),
        idempotencyKey,
      },
    });

    // Emit event for async execution
    this.eventEmitter.emit('workflow.run', {
      runId: run.id,
      workflowId: workflow.id,
      definition: versionToRun.definition as any,
      variables: dto.variables || {},
      userId: 0, // System user for webhook triggers
      tenantId: workflow.tenantId,
    });

    return {
      runId: run.id,
      workflowId: workflow.id,
      status: run.status,
      message: 'Workflow triggered via webhook',
    };
  }

  async findAll(tenantId: number, workflowId: number, query: QueryWorkflowRunDto) {
    const { page = 1, limit = 10, status, sortOrder = 'desc', from, to } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      workflowDefinitionId: workflowId,
    };

    if (status) {
      where.status = status as RunStatus;
    }

    if (from || to) {
      where.createdAt = {};
      if (from) {
        where.createdAt.gte = new Date(from);
      }
      if (to) {
        where.createdAt.lte = new Date(to);
      }
    }

    const [runs, total] = await Promise.all([
      this.prisma.workflowRun.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: sortOrder },
        include: {
          stepRuns: {
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
      this.prisma.workflowRun.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    const nextCursor = page < totalPages ? String(page + 1) : undefined;

    return {
      data: runs,
      meta: {
        total,
        page,
        perPage: limit,
        totalPages,
        nextCursor,
      },
    };
  }

  async findOne(tenantId: number, runId: number) {
    const run = await this.prisma.workflowRun.findUnique({
      where: { id: runId },
      include: {
        stepRuns: {
          orderBy: { createdAt: 'asc' },
        },
        workflowDefinition: {
          select: {
            id: true,
            name: true,
            tenantId: true,
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException(`Workflow run with ID ${runId} not found`);
    }

    if (run.workflowDefinition.tenantId !== tenantId) {
      throw new ForbiddenException('Access denied');
    }

    return run;
  }

  async cancel(tenantId: number, runId: number, userId: number) {
    const run = await this.findOne(tenantId, runId);

    if (run.status !== RunStatus.PENDING && run.status !== RunStatus.RUNNING) {
      throw new BadRequestException('Only PENDING or RUNNING workflows can be cancelled');
    }

    return this.prisma.workflowRun.update({
      where: { id: runId },
      data: {
        status: RunStatus.CANCELLED,
        completedAt: new Date(),
      },
    });
  }

  async retry(tenantId: number, runId: number, userId: number) {
    const originalRun = await this.findOne(tenantId, runId);

    if (originalRun.status !== RunStatus.FAILED && originalRun.status !== RunStatus.TIMED_OUT) {
      throw new BadRequestException('Only FAILED or TIMED_OUT workflows can be retried');
    }

    const workflow = await this.prisma.workflowDefinition.findFirst({
      where: { id: originalRun.workflowDefinitionId, tenantId },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    // Create new run
    const newRun = await this.prisma.workflowRun.create({
      data: {
        workflowDefinitionId: workflow.id,
        workflowVersionId: originalRun.workflowVersionId,
        status: RunStatus.PENDING,
        startedAt: new Date(),
      },
    });

    // Emit event for async execution
    this.eventEmitter.emit('workflow.run', {
      runId: newRun.id,
      workflowId: workflow.id,
      definition: workflow.versions[0]?.definition,
      variables: {},
      userId,
      tenantId,
    });

    return {
      runId: newRun.id,
      status: newRun.status,
      message: 'Workflow retry triggered successfully',
    };
  }

  async getStats(tenantId: number, workflowId?: number) {
    const where = workflowId ? { workflowDefinition: { tenantId, id: workflowId } } : { workflowDefinition: { tenantId } };

    // OPTIMIZATION: Single query with GROUP BY instead of 6 separate COUNT queries
    const statusCounts = await this.prisma.workflowRun.groupBy({
      by: ['status'],
      where,
      _count: { status: true },
    });

    // Transform groupBy results into a map
    const countByStatus = new Map<string, number>();
    let total = 0;
    for (const item of statusCounts) {
      countByStatus.set(item.status, item._count.status);
      total += item._count.status;
    }

    const pending = countByStatus.get(RunStatus.PENDING) || 0;
    const running = countByStatus.get(RunStatus.RUNNING) || 0;
    const success = countByStatus.get(RunStatus.SUCCESS) || 0;
    const failed = countByStatus.get(RunStatus.FAILED) || 0;
    const timedOut = countByStatus.get(RunStatus.TIMED_OUT) || 0;
    const cancelled = countByStatus.get(RunStatus.CANCELLED) || 0;

    // OPTIMIZATION: Use AVG() in database instead of loading all rows into memory
    const durationResult = await this.prisma.workflowRun.aggregate({
      where: {
        ...where,
        status: { in: [RunStatus.SUCCESS, RunStatus.FAILED, RunStatus.CANCELLED] },
        completedAt: { not: null },
        startedAt: { not: null },
      },
      _avg: {
        // Custom aggregation - we calculate from the difference of timestamps
      },
    });

    // Calculate average duration using database-level computation
    const avgDurationResult = await this.prisma.$queryRaw<{ avg_duration: number | null }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000) as avg_duration
      FROM workflow_runs
      WHERE workflow_definition_id IN (
        SELECT id FROM workflow_definitions WHERE tenant_id = ${tenantId}
        ${workflowId ? Prisma.sql`AND id = ${workflowId}` : Prisma.empty}
      )
      AND status IN ('SUCCESS', 'FAILED', 'CANCELLED')
      AND completed_at IS NOT NULL
      AND started_at IS NOT NULL
    `;

    const avgDuration = avgDurationResult[0]?.avg_duration || 0;

    return {
      total,
      byStatus: {
        pending,
        running,
        success,
        failed,
        timedOut,
        cancelled,
      },
      averageDurationMs: Number(avgDuration),
    };
  }
}
