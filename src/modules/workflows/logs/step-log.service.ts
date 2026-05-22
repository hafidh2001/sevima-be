import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { LogLevel } from '@prisma/client';

export interface LogEntry {
  stepRunId: number;
  level: LogLevel;
  message: string;
  metadata?: Record<string, any>;
}

export interface QueryLogsOptions {
  stepRunId: number;
  levels?: LogLevel[];
  limit?: number;
  offset?: number;
}

@Injectable()
export class StepLogService {
  private readonly logger = new Logger(StepLogService.name);
  private logBuffer: LogEntry[] = [];
  private readonly BUFFER_SIZE = 100;
  private readonly FLUSH_INTERVAL_MS = 5000;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {
    this.startFlushTimer();
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch((err) => {
        this.logger.error(`Failed to flush log buffer: ${err.message}`);
      });
    }, this.FLUSH_INTERVAL_MS);
  }

  async log(entry: LogEntry): Promise<void>;
  async log(stepRunId: number, level: LogLevel, message: string, metadata?: Record<string, any>): Promise<void>;
  async log(
    stepRunIdOrEntry: number | LogEntry,
    levelOrMessage?: LogLevel | string,
    messageOrMetadata?: string | Record<string, any>,
    metadata?: Record<string, any>,
  ): Promise<void> {
    let entry: LogEntry;

    if (typeof stepRunIdOrEntry === 'number') {
      entry = {
        stepRunId: stepRunIdOrEntry,
        level: levelOrMessage as LogLevel,
        message: messageOrMetadata as string,
        metadata: metadata,
      };
    } else {
      entry = stepRunIdOrEntry;
    }

    this.logBuffer.push(entry);

    if (this.logBuffer.length >= this.BUFFER_SIZE) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.logBuffer.length === 0) return;

    const entriesToFlush = this.logBuffer.splice(0, this.logBuffer.length);

    try {
      await this.prisma.stepLog.createMany({
        data: entriesToFlush.map((entry) => ({
          stepRunId: entry.stepRunId,
          level: entry.level,
          message: entry.message,
          metadata: entry.metadata || undefined,
        })),
        skipDuplicates: false,
      });
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to persist ${entriesToFlush.length} log entries: ${err.message}`);
      this.logBuffer.unshift(...entriesToFlush);
    }
  }

  async queryLogs(options: QueryLogsOptions): Promise<{ logs: any[]; total: number }> {
    const { stepRunId, levels, limit = 100, offset = 0 } = options;

    const where: any = { stepRunId };
    if (levels && levels.length > 0) {
      where.level = { in: levels };
    }

    const [logs, total] = await Promise.all([
      this.prisma.stepLog.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.stepLog.count({ where }),
    ]);

    return { logs, total };
  }

  async getLogsByWorkflowRun(
    workflowRunId: number,
    options: { levels?: LogLevel[]; limit?: number; offset?: number } = {},
  ): Promise<{ logs: any[]; total: number }> {
    const { levels, limit = 1000, offset = 0 } = options;

    const where: any = {
      stepRun: {
        workflowRunId,
      },
    };

    if (levels && levels.length > 0) {
      where.level = { in: levels };
    }

    const [logs, total] = await Promise.all([
      this.prisma.stepLog.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        take: limit,
        skip: offset,
        include: {
          stepRun: {
            select: {
              id: true,
              stepId: true,
              stepName: true,
            },
          },
        },
      }),
      this.prisma.stepLog.count({ where }),
    ]);

    return { logs, total };
  }

  async getErrorLogs(
    tenantId: number,
    options: { from?: Date; to?: Date; limit?: number; offset?: number } = {},
  ): Promise<{ logs: any[]; total: number }> {
    const { from, to, limit = 100, offset = 0 } = options;

    const where: any = {
      level: LogLevel.ERROR,
      stepRun: {
        workflowRun: {
          workflowDefinition: {
            tenantId,
          },
        },
      },
    };

    if (from || to) {
      where.createdAt = {};
      if (from) {
        where.createdAt.gte = from;
      }
      if (to) {
        where.createdAt.lte = to;
      }
    }

    const [logs, total] = await Promise.all([
      this.prisma.stepLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          stepRun: {
            select: {
              id: true,
              stepId: true,
              stepName: true,
              workflowRunId: true,
              workflowRun: {
                select: {
                  id: true,
                  workflowDefinition: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.stepLog.count({ where }),
    ]);

    return { logs, total };
  }

  async deleteOldLogs(retentionDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await this.prisma.stepLog.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    return result.count;
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}
