import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { RunStatus } from '@prisma/client';

export interface GlobalRunStats {
  total: number;
  byStatus: {
    pending: number;
    running: number;
    success: number;
    failed: number;
    timedOut: number;
    cancelled: number;
  };
  successRate: number;
  failureRate: number;
  averageDurationMs: number;
}

@Injectable()
export class RunsService {
  constructor(private readonly prisma: PrismaService) {}

  async getGlobalStats(tenantId: number): Promise<GlobalRunStats> {
    // Get status counts grouped by status
    const statusCounts = await this.prisma.workflowRun.groupBy({
      by: ['status'],
      where: {
        workflowDefinition: { tenantId },
      },
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

    // Calculate success and failure rates
    const completedTotal = success + failed + cancelled;
    const successRate = completedTotal > 0 ? (success / completedTotal) * 100 : 0;
    const failureRate = completedTotal > 0 ? ((failed + timedOut) / completedTotal) * 100 : 0;

    // Calculate average duration using aggregate
    // Get runs with completed status to calculate duration
    const completedRuns = await this.prisma.workflowRun.findMany({
      where: {
        workflowDefinition: { tenantId },
        status: { in: [RunStatus.SUCCESS, RunStatus.FAILED, RunStatus.CANCELLED] },
        completedAt: { not: null },
        startedAt: { not: null },
      },
      select: {
        startedAt: true,
        completedAt: true,
      },
    });

    // Calculate average duration in memory
    let totalDurationMs = 0;
    let validRuns = 0;
    for (const run of completedRuns) {
      if (run.startedAt && run.completedAt) {
        const duration = run.completedAt.getTime() - run.startedAt.getTime();
        totalDurationMs += duration;
        validRuns++;
      }
    }
    const averageDurationMs = validRuns > 0 ? totalDurationMs / validRuns : 0;

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
      successRate: Math.round(successRate * 10) / 10, // Round to 1 decimal
      failureRate: Math.round(failureRate * 10) / 10,
      averageDurationMs,
    };
  }
}
